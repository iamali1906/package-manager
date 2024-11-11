#!/usr/bin/env node
import yargs from "yargs";
import { NpmRegistryClient } from "./NpmRegistryClient";

/*
 * This file is for CLI usage.
 * There isn't too much logic about package manager here.
 */

yargs
  .usage("mpm <command> [args]")
  .version()
  .alias("v", "version")
  .help()
  .alias("h", "help")
  .command(
    "add",
    "add the dependencies.",
    (argv) => {
      argv.option("production", {
        type: "boolean",
        description: "Install production dependencies only.",
      });

      argv.boolean("save-dev");
      argv.boolean("dev");
      argv.alias("D", "dev");

      return argv;
    },
    NpmRegistryClient.pm
  )
  .command(
    "*",
    "Install the dependencies.",
    (argv) =>
      argv.option("production", {
        type: "boolean",
        description: "Install production dependencies only.",
      }),
    NpmRegistryClient.pm
  )
  .parse();
