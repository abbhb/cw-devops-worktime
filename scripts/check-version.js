const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").trim();
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

const version = readText("VERSION");
const packageVersion = readJson("package.json").version;
const manifestVersion = readJson("manifest.json").version;

if (!version) {
  console.error("VERSION 文件不能为空");
  process.exit(1);
}

if (version !== packageVersion || version !== manifestVersion) {
  console.error(
    `版本号不一致：VERSION=${version}, package.json=${packageVersion}, manifest.json=${manifestVersion}`
  );
  process.exit(1);
}

console.log(`version ok: ${version}`);
