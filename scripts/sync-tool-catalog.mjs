import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  console.log("FIREBASE_SERVICE_ACCOUNT_JSON が未設定のため、catalog 同期をスキップしました。");
  process.exit(0);
}

const configPath = resolve(process.cwd(), "tool.config.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const placeholderValues = new Set([
  "replace-this-tool-id",
  "replace-this-owner",
  "replace-this-repo-name",
  "Replace This Tool Name",
]);

const repository = process.env.GITHUB_REPOSITORY;
const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER;
const repositoryName = process.env.GITHUB_EVENT_REPOSITORY_NAME;

if (!repository || !repositoryOwner || !repositoryName) {
  throw new Error("GitHub Actions の repository 情報が不足しています。");
}

if (!config.namespace || !config.id || !config.name || !config.description || !config.owner || !config.repo) {
  throw new Error("tool.config.json の必須項目が不足しています。");
}

if (config.repo !== repositoryName) {
  throw new Error(`tool.config.json の repo (${config.repo}) と実際の repo 名 (${repositoryName}) が一致しません。`);
}

if (config.owner !== repositoryOwner) {
  throw new Error(`tool.config.json の owner (${config.owner}) と実際の owner (${repositoryOwner}) が一致しません。`);
}

for (const key of ["id", "name", "owner", "repo"]) {
  if (placeholderValues.has(config[key])) {
    throw new Error(`tool.config.json の ${key} がプレースホルダーのままです。`);
  }
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(config.id)) {
  throw new Error("tool.config.json の id は英小文字・数字・ハイフンのみで指定してください。");
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(config.namespace)) {
  throw new Error("tool.config.json の namespace は英小文字・数字・ハイフンのみで指定してください。");
}

const catalogMode = config.catalogMode ?? "publish";
if (!["publish", "hide", "remove"].includes(catalogMode)) {
  throw new Error("tool.config.json の catalogMode は publish / hide / remove のいずれかにしてください。");
}

const app = initializeApp({
  credential: cert(JSON.parse(serviceAccountJson)),
});

const firestore = getFirestore(app);
const documentId = `${config.namespace}__${config.id}`;
const documentRef = firestore.collection("tools").doc(documentId);

if (catalogMode === "remove") {
  await documentRef.delete();
  console.log(`Removed tools/${documentId}`);
} else {
  await documentRef.set(
    {
      toolId: config.id,
      name: config.name,
      description: config.description,
      url: `https://${repositoryOwner}.github.io/${repositoryName}/`,
      repo: repository,
      tags: Array.isArray(config.tags) ? config.tags : [],
      visible: catalogMode === "hide" ? false : config.visible !== false,
      sortOrder: typeof config.sortOrder === "number" ? config.sortOrder : 9999,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`Synced tools/${documentId}`);
}
