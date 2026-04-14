import toolConfig from "../../tool.config.json";

export type ToolConfig = typeof toolConfig;

const placeholderValues = new Set([
  "replace-this-tool-id",
  "replace-this-owner",
  "replace-this-repo-name",
  "Replace This Tool Name",
]);

function isFilledValue(value: string) {
  return value.trim().length > 0 && !placeholderValues.has(value);
}

function getGitHubOwner() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname.endsWith(".github.io")
    ? window.location.hostname.replace(/\.github\.io$/, "")
    : null;
}

function getRuntimeRepoName() {
  if (typeof window === "undefined") {
    return null;
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[0] ?? null;
}

const owner = getGitHubOwner();
const runtimeRepoName = getRuntimeRepoName();
const namespace =
  "namespace" in toolConfig && typeof toolConfig.namespace === "string" && toolConfig.namespace.trim().length > 0
    ? toolConfig.namespace.trim()
    : null;
const configuredOwner = "owner" in toolConfig && isFilledValue(toolConfig.owner) ? toolConfig.owner : null;
const resolvedOwner = configuredOwner ?? owner;
const repo = isFilledValue(toolConfig.repo) ? toolConfig.repo : runtimeRepoName ?? toolConfig.repo;
const id = isFilledValue(toolConfig.id) ? toolConfig.id : repo;
const configIssues = [
  !namespace ? "`tool.config.json` の `namespace` を固定値で指定してください。" : null,
  !isFilledValue(toolConfig.id) ? "`tool.config.json` の `id` を固有値に変更してください。" : null,
  !configuredOwner && !owner ? "`tool.config.json` の `owner` を実際の owner に変更してください。" : null,
  !isFilledValue(toolConfig.repo) ? "`tool.config.json` の `repo` を実際の repo 名に変更してください。" : null,
  !isFilledValue(toolConfig.name) ? "`tool.config.json` の `name` を実際のツール名に変更してください。" : null,
].filter((value): value is string => value !== null);

export const currentTool = {
  ...toolConfig,
  namespace,
  id,
  owner: resolvedOwner,
  repo,
  toolId: namespace ? `${namespace}__${id}` : id,
  fullRepo: resolvedOwner ? `${resolvedOwner}/${repo}` : repo,
  publicUrl: resolvedOwner ? `https://${resolvedOwner}.github.io/${repo}/` : undefined,
  configIssues,
};
