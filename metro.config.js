const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

/**
 * This project lives inside a folder that has its own unrelated package.json and
 * node_modules (with a different React version). Node resolution walks up the directory
 * tree, so that copy is visible to Metro. Two copies of React in one bundle breaks
 * Fabric with a native crash during view mounting.
 *
 * We cannot simply disable the hierarchical walk: that is also how a package finds its
 * own nested node_modules (expo-router relies on this for @expo/metro-runtime). Instead
 * we pin the top-level module directory and hide only the parent folder.
 */
const parentModules = path.resolve(projectRoot, '..', 'node_modules');
const escaped = parentModules.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const existingBlockList = config.resolver.blockList;
const blocked = Array.isArray(existingBlockList)
  ? existingBlockList
  : existingBlockList
    ? [existingBlockList]
    : [];

config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.blockList = [...blocked, new RegExp(`^${escaped}${path.sep}.*`)];
config.watchFolders = [projectRoot];

module.exports = config;
