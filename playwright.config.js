const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	use: {
		baseURL: "http://127.0.0.1:4173",
		browserName: "chromium",
		headless: true
	},
	webServer: {
		command: "node tests/server.js",
		url: "http://127.0.0.1:4173",
		reuseExistingServer: !process.env.CI,
		timeout: 10_000
	},
	reporter: "list"
});
