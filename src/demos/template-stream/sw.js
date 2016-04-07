function streamingTemplateResponse() {
  // Fetch photo data from Flickr
  const kittenPhoto = fetch('https://api.flickr.com/services/rest/?api_key=f2cca7d09b75c6cdea6864aca72e9895&format=json&text=kitten&extras=url_m&per_page=1&nojsoncallback=1&method=flickr.photos.search')
    .then(r => r.json())
    .then(data => data.photos.photo[0]);

  // Get the parts of the image data we need
  const kittenWidth  = kittenPhoto.then(data => htmlEscape(data.width_m)); 
  const kittenHeight = kittenPhoto.then(data => htmlEscape(data.height_m)); 
  const kittenURL    = kittenPhoto.then(data => htmlEscape(data.url_m));
  const kittenAlt    = kittenPhoto.then(data => htmlEscape(data.title));

  // Fetch the service worker script and get its content stream  
  const serviceWorkerScript = fetch('sw.js').then(r => htmlEscapeStream(r.body));
  
  // Generate the stream
  const body = templateStream`<!DOCTYPE html>
    <html>
    <head>
      <title>Streaming template literals Batman!</title>
      <link rel="stylesheet" href="styles.css">
    </head>
    <body>
      <h1>This content streams in from the service worker</h1>
      <p>For instance, this image tag is populated from a request to Flickr's API:</p>
      <img src="${kittenURL}" width="${kittenWidth}" height="${kittenHeight}" alt="${kittenAlt}">
      <p>And just to be really meta, here's the service worker that created the streaming response streamed into this response:</p>
      <pre class="language-js"><code class="language-js">${serviceWorkerScript}</code></pre>
      <script src="prism.js"></script>
    </body>
    </html>
  `;
  
  // Create a response with the stream
  return new Response(body, {
    headers: {'Content-Type': 'text/html'}
  });
}

// This generates a stream from a template
function templateStream(strings, ...values) {
  let items = [];
  
  // Create a single array of strings and values interleaved
  strings.forEach((str, i) => {
    items.push(str);
    if (i in values) items.push(values[i]);
  });
  
  // Turn them all into promises - makes it easier.
  // Then get an iterator for the values
  items = items.map(i => Promise.resolve(i)).values();
  
  // So we can turn our text into bytes
  const encoder = new TextEncoder();
  
  // Return the stream
  return new ReadableStream({
    pull(controller) {
      // Get the next value
      const result = items.next();

      // End the stream if there are no more values      
      if (result.done) {
        controller.close();
        return;
      }
      
      // Wait for it to resolve
      return result.value.then(val => {
        // Does it look like a stream?
        if (val.getReader) {
          // If so, 'pipe' the data to our stream
          const reader = val.getReader();
          return reader.read().then(function process(result) {
            if (result.done) return;
            controller.enqueue(result.value);
            return reader.read().then(process);
          });
        }
        // If not, encode the string and pass it to our stream
        controller.enqueue(encoder.encode(val));
      });
    }
  });
}

const htmlEscapes = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;'
};

function htmlEscape(str) {
  return str.replace(/[&<>"'`]/g, item => htmlEscapes[item]);
}

function htmlEscapeStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  
  return new ReadableStream({
    pull(controller) {
      return reader.read().then(result => {
        if (result.done) {
          controller.close();
          return;
        }
        
        const val = htmlEscape(decoder.decode(result.value, {stream:true}));
        controller.enqueue(encoder.encode(val));
      })
    }
  });
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  if (url.origin == location.origin && url.pathname.endsWith('/template-stream/')) {
    event.respondWith(streamingTemplateResponse());
  }
});

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  clients.claim();
});