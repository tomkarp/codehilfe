const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mimeTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8"
};

http.createServer((request, response) => {
	const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
	const file = path.resolve(root, `.${pathname}`);
	if (!file.startsWith(`${root}${path.sep}`) && file !== root) {
		response.writeHead(403).end("Forbidden");
		return;
	}
	fs.readFile(file, (error, content) => {
		if (error) {
			response.writeHead(404).end("Not found");
			return;
		}
		response.writeHead(200, {
			"content-type": mimeTypes[path.extname(file)] || "application/octet-stream"
		});
		response.end(content);
	});
}).listen(4173, "127.0.0.1");
