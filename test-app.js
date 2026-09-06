const jsdom = require("jsdom");
const fs = require("fs");
const { JSDOM } = jsdom;

const html = fs.readFileSync("index.html", "utf-8");
const js = fs.readFileSync("app.js", "utf-8");

const dom = new JSDOM(html, {
    runScripts: "dangerously",
    url: "http://localhost/"
});

dom.window.fetch = async (url) => {
    console.log("FETCH CALLED:", url);
    return {
        json: async () => ({ error: "mocked" }),
        ok: true,
        status: 200
    };
};

dom.window.eval(`
    try {
        ${js}
        console.log("APP.JS LOADED SUCCESSFULLY");
    } catch (e) {
        console.error("APP.JS CRASHED:", e);
    }
`);
