import findUp from "find-up";
import * as fs from "fs-extra";
import type yargs from "yargs";
import install from "./install";
import list, { PackageJson } from "./list";
import * as lock from "./lock";
import * as log from "./log";
import * as utils from "./utils";
import path from "path";
/**
 * A client for the NPM registry API.
 */

export class NpmRegistryClient {
  static async pm(args: yargs.Arguments) {
    // Find and read the `package.json`.
    const jsonPath = (await findUp("package.json"))!;

    const root = await fs.readJson(jsonPath);

    const additionalPackages = args._.slice(1) as string[];
    if (additionalPackages.length) {
      if (args["save-dev"] || args.dev) {
        root.devDependencies = root.devDependencies || {};

        additionalPackages.forEach((pkg) => {
          const [name, version] = pkg.split("@");
          root.devDependencies[name] = version ? `^${version}` : "";
        });
      } else {
        root.dependencies = root.dependencies || {};

        additionalPackages.forEach((pkg) => {
          const [name, version] = pkg.split("@");
          root.dependencies[name] = version ? `^${version}` : "";
        });
      }
    }

    /*
     * In production mode,
     * we just need to resolve production dependencies.
     */
    if (args.production) {
      delete root.devDependencies;
    }

    // Read the lock file if exists
    await lock.readLock();

    // Generate the dependencies information.
    const info = await list(root);

    // Save the lock file asynchronously.
    lock.writeLock();

    /*
     * Prepare for the progress bar.
     * Note that we re-compute the number of packages.
     * Because of the duplication,
     * number of resolved packages is not equivalent to
     * the number of packages to be installed.
     */
    log.prepareInstall(
      Object.keys(info.topLevel).length + info.unsatisfied.length
    );

    // Install top level packages.
    await Promise.all(
      Object.entries(info.topLevel).map(([name, { url }]) => install(name, url))
    );

    // Install packages which have conflicts.
    await Promise.all(
      info.unsatisfied.map((item) =>
        install(item.name, item.url, `/node_modules/${item.parent}`)
      )
    );

    // Save the `package.json` file.
    fs.writeJson(jsonPath, root, { spaces: 2 });

    // That's all! Everything should be finished if no errors occurred.
  }
}
