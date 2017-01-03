console.log("Running catapult_runner");

// Global var for various debugging
var activeModel = null;

var ttiHistogramNames = [
  'firstInteractive-FMP',
  'firstInteractive-FCP',
  'firstInteractive-StartNav',
  'firstInteractive-FMP-ReverseSearch',
  'firstInteractive-FCP-ReverseSearch',
  'firstInteractive-StartNav-ReverseSearch',
  'firstInteractive-FMP-Network',
  'firstInteractive-FMP-ReverseSearchFromNetworkFirstInteractive'
];

function storeTraceInIDB(trace) {
  // Put the uploaded trace in an indexedDB because it's 3AM and that's the best
  // idea I have for passing a file across setting location.href

  // Open (or create) the database
  return new Promise((resolve, reject) => {
    var open = indexedDB.open("TraceDB", 1);

    // Create the schema
    open.onupgradeneeded = function() {
      var db = open.result;
      var store = db.createObjectStore("TraceStore", {keyPath: "id"});
    };

    open.onsuccess = function() {
      // Start a new transaction
      console.log("DB connection opened. Storing trace");
      var db = open.result;
      var tx = db.transaction("TraceStore", "readwrite");
      var store = tx.objectStore("TraceStore");

      // Add some data
      store.put({id: 0, rawTrace: trace});

      // Close the db when the transaction is done
      tx.oncomplete = function() {
        console.log("storing transaction complete.");
        db.close();
        resolve();
      };
    }
  });
}

function issueRedirectForUploadedTrace(){
  const parsedURL = new URL(location.href);
  parsedURL.searchParams.delete('loadTimelineFromURL')
  parsedURL.searchParams.append('loadTimelineFromURL', 'LOADFROMDB')
  location.href = parsedURL;
}

function onModelLoad(model) {
  console.log("executing onModelLoad");

  var histogramSet = new tr.v.HistogramSet();
  tr.metrics.sh.loadingMetric(histogramSet, model);
  console.log("histogramSet", histogramSet);

  for (var histogramName of ttiHistogramNames) {
    var values = histogramSet.getValuesNamed(histogramName);
    console.log("histogramValues for", histogramName, values);
    if (values.length > 1) {
      console.warn("More than one histogram found of ", histogramName);
      console.warn("I don't know what to do with all these.");
      continue;
    }
    if (values.length < 1) continue;

    var metricValue = values[0];
    if (!metricValue.running) continue;
    console.log("merticValue", metricValue);
    if (metricValue.running.count > 1) {
      console.warn("More than one value was added to the histogram of ", histogramName);
      console.warn("I can't handle this yet");
      continue;
    }
    if (metricValue.running.count < 1) continue;
    console.log("processing ", histogramName);
    var uglyGlobals = window.uglyGlobals || {};
    uglyGlobals.markers = uglyGlobals.markers || [];
    uglyGlobals.markers.push({
      title: histogramName,
      time: metricValue.running.mean
    });
    window.uglyGlobals = uglyGlobals;
  }
  // convert this into a promise.
  // onMetricsComputed();
}

function setActiveModel(data) {
  console.log("Setting active model");
  var model = new tr.Model();
  var importOptions = new tr.importer.ImportOptions();
  importOptions.pruneEmptyContainers = false;
  importOptions.showImportWarnings = true;
  importOptions.trackDetailedModelStats = true;
  var i = new tr.importer.Import(model, importOptions);
  return i.importTracesWithProgressDialog([data]).then(
    function() {
      activeModel = model;
      onModelLoad(model);
    }.bind(this),
    function(err) {
      tr.ui.b.Overlay.showError('Trace import error: ' + err);
      console.error(err);
    });
}

function handleFileSelect(evt) {
  console.log("Handling selected files");
  var files = evt.target.files; // FileList object
  var f = files[0];
  tr.ui.b.readFile(f).then(res => storeTraceInIDB(res))
    .then(issueRedirectForUploadedTrace);
}

function populateMetricInfoBox() {
  if (window.uglyGlobals.markers) {
    console.log("Populating metric info box");
    var metricInfo = document.querySelector('#metricInfoContents');
    // Poor man's JSX
    var liItems = [];
    for (var m of window.uglyGlobals.markers) {
      liItems.push(`<li>${m.title}: ${m.time.toFixed(2)}ms</li>`);
    }
    metricInfo.innerHTML = '<ul>' + liItems.join('') + '</ul>';
  }
}

function installMetricInfoBoxHandlers() {
  var toggle = document.querySelector("#metricInfoToggle");
  toggle.onclick = () => {
    var infoContainer = document.querySelector('#metricInfo');
    infoContainer.style.display = infoContainer.style.display === 'block'
      ? 'none' : 'block';
  };
}

function setGlobalMarkersFromURL() {
  var params = new URL(location.href).searchParams;
  var markers = JSON.parse(decodeURIComponent(params.get('markers')));
  if (markers) {
    window.uglyGlobals = window.uglyGlobals || {};
    window.uglyGlobals.markers = markers;
    populateMetricInfoBox();
  }
  console.log("set global markers");
}

function setGlobalTraceFromURL() {
  console.log("Set global trace from url");
  // Open (or create) the database
  var open = indexedDB.open("TraceDB", 1);

  // Create the schema
  open.onupgradeneeded = function() {
    var db = open.result;
    var store = db.createObjectStore("TraceStore", {keyPath: "id"});
  };

  open.onsuccess = function() {
    // Start a new transaction
    console.log("Starting tx for loading trace");
    var db = open.result;
    var tx = db.transaction("TraceStore", "readwrite");
    var store = tx.objectStore("TraceStore");

    // Query the data
    var getTrace = store.get(0);

    getTrace.onsuccess = function() {
      console.log("Loaded trace ", getTrace.result.rawTrace.length);
      window.uglyGlobals = window.uglyGlobals || {};
      window.uglyGlobals.rawTrace = getTrace.result.rawTrace;
    };


    // Close the db when the transaction is done
    tx.oncomplete = function() {
      // Timeline viewer is ready to run
      console.log("trace load transaction 'complete'. Running load callbacks");
      window.uglyGlobals.runOnWindowLoad.forEach(f => f());
      window.uglyGlobals.globalsReady = true;
      db.close();
    };
  }
}

document.getElementById('files').addEventListener('change', handleFileSelect, false);

// try {
//   setGlobalMarkersFromURL();
// } catch (e) {}

// var params = new URL(location.href).searchParams;
// if (params.get('loadTimelineFromURL') === 'LOADFROMDB') {
//   console.log("Loading from DB");
//   setGlobalTraceFromURL();
// } else {
//   console.log("Taking the classical path");
//   document.addEventListener('DOMContentLoaded', () => {
//     console.log("Firing synthetic DCL listener");
//     window.uglyGlobals.runOnWindowLoad.forEach(f => f());
//   })
// }
