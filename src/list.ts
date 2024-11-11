import * as semver from "semver";
import * as lock from "./lock";
import * as log from "./log";
import resolve from "./resolve";

interface DependenciesMap {
  [dependency: string]: string;
}
// eslint-disable-next-line @typescript-eslint/no-type-alias
type DependencyStack = Array<{
  name: string;
  version: string;
  dependencies: { [dep: string]: string };
}>;
export interface PackageJson {
  dependencies?: DependenciesMap;
  devDependencies?: DependenciesMap;
}

/*
 * The `topLevel` variable is to flatten packages tree
 * to avoid duplication.
 */
const topLevel: {
  [name: string]: { url: string; version: string };
} = Object.create(null);

/*
 * However, there may be dependencies conflicts,
 * so this variable is for that.
 */
const unsatisfied: Array<{ name: string; parent: string; url: string }> = [];

async function collectDeps(
  name: string,
  constraint: string,
  stack: DependencyStack = []
) {
  // Retrieve a single manifest by name from the lock.
  const fromLock = lock.getItem(name, constraint);

  /*
   * Fetch the manifest information.
   * If that manifest is not existed in the lock,
   * fetch it from network.
   */
  const manifest = fromLock || (await resolve(name));

  // Add currently resolving module to CLI
  log.logResolving(name);

  /*
   * Use the latest version of a package
   * while it will conform the semantic version.
   * However, if no semantic version is specified,
   * use the latest version.
   */
  const versions = Object.keys(manifest);
  const matched = constraint
    ? semver.maxSatisfying(versions, constraint)
    : versions[versions.length - 1]; // The last one is the latest.
  if (!matched) {
    throw new Error("Cannot resolve suitable package.");
  }

  const matchedManifest = manifest[matched]!;

  if (!topLevel[name]) {
    /*
     * If this package is not existed in the `topLevel` map,
     * just put it.
     */
    topLevel[name] = { url: matchedManifest.dist.tarball, version: matched };
  } else if (semver.satisfies(topLevel[name]!.version, constraint)) {
    const conflictIndex = checkStackDependencies(name, matched, stack);
    if (conflictIndex === -1) {
      /*
       * Remember to return this function to skip the dependencies checking.
       * This may avoid dependencies circulation.
       */
      return;
    }

    unsatisfied.push({
      name,
      parent: stack
        .map(({ name }) => name) // eslint-disable-line no-shadow
        .slice(conflictIndex - 2)
        .join("/node_modules/"),
      url: matchedManifest.dist.tarball,
    });
  } else {
    /*
     * Yep, the package is already existed in that map,
     * but it has conflicts because of the semantic version.
     * So we should add a record.
     */
    unsatisfied.push({
      name,
      parent: stack.at(-1)!.name,
      url: matchedManifest.dist.tarball,
    });
  }

  // Don't forget to collect the dependencies of our dependencies.
  const dependencies = matchedManifest.dependencies ?? {};

  // Save the manifest to the new lock.
  lock.updateOrCreate(`${name}@${constraint}`, {
    version: matched,
    url: matchedManifest.dist.tarball,
    shasum: matchedManifest.dist.shasum,
    dependencies,
  });

  /*
   * Collect the dependencies of dependency,
   * so it's time to be deeper.
   */
  if (dependencies) {
    stack.push({
      name,
      version: matched,
      dependencies,
    });
    await Promise.all(
      Object.entries(dependencies)
        // The filter below is to prevent dependency circulation
        .filter(([dep, range]) => !hasCirculation(dep, range, stack))
        .map(([dep, range]) => collectDeps(dep, range, stack.slice()))
    );
    stack.pop();
  }

  /*
   * Return the semantic version range to
   * add missing semantic version range in `package.json`.
   */
  if (!constraint) {
    return { name, version: `^${matched}` };
  }
}

/**
 * This function is to check if there are conflicts in the
 * dependencies of dependency, not the top level dependencies.
 */
function checkStackDependencies(
  name: string,
  version: string,
  stack: DependencyStack
) {
  return stack.findIndex(({ dependencies }) => {
    const semverRange = dependencies[name];
    /*
     * If this package is not as a dependency of another package,
     * this is safe and we just return `true`.
     */
    if (!semverRange) {
      return true;
    }

    // Semantic version checking.
    return semver.satisfies(version, semverRange);
  });
}

/**
 * This function is to check if there is dependency circulation.
 *
 * If a package is existed in the stack and it satisfy the semantic version,
 * it turns out that there is dependency circulation.
 */
function hasCirculation(name: string, range: string, stack: DependencyStack) {
  return stack.some(
    (item) => item.name === name && semver.satisfies(item.version, range)
  );
}

export default async function (rootManifest: PackageJson) {
  if (rootManifest.dependencies) {
    (
      await Promise.all(
        Object.entries(rootManifest.dependencies).map((pair) =>
          collectDeps(...pair)
        )
      )
    )
      .filter(Boolean)
      .forEach(
        (item) => (rootManifest.dependencies![item!.name] = item!.version)
      );
  }

  // Process development dependencies
  if (rootManifest.devDependencies) {
    (
      await Promise.all(
        Object.entries(rootManifest.devDependencies).map((pair) =>
          collectDeps(...pair)
        )
      )
    )
      .filter(Boolean)
      .forEach(
        (item) => (rootManifest.devDependencies![item!.name] = item!.version)
      );
  }

  return { topLevel, unsatisfied };
}
