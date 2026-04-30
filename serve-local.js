const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const preferredPort = Number(process.argv[2]) || 8080;
const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/manifest+json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml; charset=utf-8"
};

function sendFile(response, filePath) {
    fs.readFile(filePath, function (error, data) {
        if (error) {
            response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            response.end("Not found");
            return;
        }

        response.writeHead(200, {
            "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
            "cache-control": "no-cache"
        });
        response.end(data);
    });
}

function createServer(port) {
    const server = http.createServer(function (request, response) {
        const requestUrl = new URL(request.url, "http://127.0.0.1");
        const urlPath = decodeURIComponent(requestUrl.pathname);
        const filePath = path.resolve(root, urlPath === "/" ? "cv.html" : urlPath.slice(1));

        if (!filePath.startsWith(root)) {
            response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
            response.end("Forbidden");
            return;
        }

        sendFile(response, filePath);
    });

    server.on("error", function (error) {
        if (error.code === "EADDRINUSE" && port < preferredPort + 20) {
            createServer(port + 1);
            return;
        }

        throw error;
    });

    server.listen(port, "127.0.0.1", function () {
        console.log("Construct Viewer is available at http://127.0.0.1:" + port + "/");
    });
}

createServer(preferredPort);
