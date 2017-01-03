function unzipOrDecode(payload) {
  console.log("Attempting to unzip payload");
  try {
    payload = pako.inflate(payload, { to: 'string' });
    console.log("Payload unzipped");
  } catch (e) {
    // Do nothing. Original file is probably not gzipped.
    console.error(e);
    console.log("Payload not unzipped. Decoding to text");
    var decoder = new TextDecoder("utf-8");
    payload = decoder.decode(payload);
  }
  return payload;
}

function adjustURLforCORS(url) {
  var url = new URL(url);
  url.hostname = url.hostname.replace('github.com', 'githubusercontent.com');
  url.hostname = url.hostname.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
  return url.href;
}

function loadTraceFromIDB() {
  return new Promise((resolve, reject) => {
    console.log("Loading trace from IDB");
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
        resolve(getTrace.result.rawTrace);
      };

      // Close the db when the transaction is done
      tx.oncomplete = function() {
        db.close();
      };
    }

    open.onerror = function() {
      console.error("No trace found in IDB. Go back to home page and choose a trace file first.");
    };
  });
}

function fetchTrace(url, callbetween) {
  return new Promise((resolve, reject) => {
    if (url === 'LOADFROMDB') {
      return resolve(loadTraceFromIDB());
    }
    url = adjustURLforCORS(url);
    // TODO: Change this to fetch.
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = "arraybuffer";
    callbetween && callbetween(xhr);
    xhr.onload = _ => {
      resolve(unzipOrDecode(xhr.response));
    };
    xhr.onerror = err => {
      console.error('Download of asset failed. ' + ((xhr.readyState == xhr.DONE) ? 'CORS headers likely not applied.' : ''));
      reject(err);
    };
    xhr.send();
  });
}

function initViewer() {
  console.log("creating viewer");
  window.viewer = new Viewer();

  // hooks for the apis.google client.js
  self.checkAuth = function() {
    return viewer.checkAuth({immediate: true});
  }
  self.authBtn = viewer.authBtn;

  // We are monkeypatching window.loadResourcePromise, which is from devtools' Runtime.js
  viewer.monkeypatchLoadResourcePromise();
  /* window.uglyGlobal.markers = [
     {
     title: "firstInteractive",
     time: 800
     },
     {
     title: "firstInteractive-AnotherOne",
     time: 1500
     }
     ]; */
  window.uglyGlobals.runOnWindowLoad.forEach(f => f());
  populateMetricInfoBox();
}

function init() {
  // only works in Chrome because browser devtools
  if (!(window.chrome && chrome.loadTimes)) {
    document.getElementById('status').textContent = 'Sorry y\'all, Chrome required to view traces.';
    return;
  }

  installMetricInfoBoxHandlers();

  var pageURL = new URL(location.href);
  var traceURL = pageURL.searchParams.get('loadTimelineFromURL');
  if (traceURL) {
    console.log("Found trace url. Loading trace");
    window.traceCache = new Map();
    var traceCache = window.traceCache;
    fetchTrace(traceURL).then(payload => {
      console.log("Storing trace in traceCache");
      window.traceCache.set(traceURL, payload);
      return setActiveModel(payload);
    }).then(initViewer);
  }
}

console.log("Calling init");
init();
