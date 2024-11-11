import * as fs from "fs-extra";
import * as yaml from "js-yaml";
import type { Manifest } from "./resolve";
import * as utils from "./utils";

// Define the type of the lock tree.
interface Lock {
  [index: string]: {
    version: string;
    url: string;
    shasum: string;
    dependencies: { [dependency: string]: string };
  };
}

// ------------ The LOCK is here. ---------------------

/*
 * Why I use two separated locks?
 * This is useful when removing packages.
 * When adding or removing packages,
 * the lock file can be updated automatically without any manual operations.
 */

/*
 * This is the old lock.
 * The old lock is only for reading from the lock file,
 * so the old lock should be read only except reading the lock file.
 */
const oldLock: Lock = Object.create(null);

/*
 * This is the new lock.
 * The new lock is only for writing to the lock file,
 * so the new lock should be written only except saving the lock file.
 */
const newLock: Lock = Object.create(null);

// ----------------------------------------------------

/**
 * Save the information of a package to the lock.
 * If that information is not existed in the lock, create it.
 * Otherwise, just update it.
 */
export function updateOrCreate(name: string, info: Lock[string]) {
  // Create it if that information is not existed in the lock.
  if (!newLock[name]) {
    newLock[name] = Object.create(null);
  }

  // Then update it.
  Object.assign(newLock[name]!, info);
}

export function getItem(name: string, constraint: string): Manifest | null {
  const item = oldLock[`${name}@${constraint}`];

  if (!item) {
    return null;
  }

  return {
    [item.version]: {
      dependencies: item.dependencies,
      dist: { shasum: item.shasum, tarball: item.url },
    },
  };
}

export async function writeLock() {
  await fs.writeFile(
    "./mpm.yml",
    yaml.dump(utils.sortKeys(newLock), { noRefs: true })
  );
}

export async function readLock() {
  if (await fs.pathExists("./mpm.yml")) {
    Object.assign(oldLock, yaml.load(await fs.readFile("./mpm.yml", "utf-8")));
  }
}
