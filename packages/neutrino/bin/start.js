const ora = require('ora');
const debounce = require('lodash.debounce');
const DashboardPlugin = require('webpack-dashboard/plugin');
const { spawn } = require('child_process');
const { start } = require('../src');
const base = require('./base');

module.exports = (middleware, args) => {
  const spinner = ora({ text: 'Building project' });
  const argsClone = Object.assign({}, args);

  if (argsClone.dashboard) {
    argsClone.quiet = true;

    middleware.push(neutrino => {
      neutrino.config.plugin('dashboard').use(DashboardPlugin);
    });

    const child = spawn(require.resolve('webpack-dashboard/bin/webpack-dashboard.js'), [], { stdio: 'inherit' });

    process.on('exit', () => {
      child.kill();
    });
  }

  return base({
    middleware,
    args: argsClone,
    NODE_ENV: 'development',
    commandHandler(config, neutrino) {
      if (!argsClone.quiet && !argsClone.dashboard) {
        spinner.enabled = global.interactive;
        spinner.start();
      }

      return start(config, neutrino);
    },
    errorsHandler() {
      spinner.fail('Building project failed');
    },
    successHandler(compiler) {
      if (argsClone.quiet || !compiler) {
        return;
      }

      if (!compiler.options.devServer) {
        spinner.succeed('Build completed');

        const building = ora({
          text: 'Performing initial build',
          enabled: global.interactive
        });

        compiler.plugin('done', () => {
          building.succeed('Build completed');
        });
        compiler.plugin('compile', () => {
          building.text = 'Source changed, re-compiling';
          building.start();
        });
      } else {
        const { devServer } = compiler.options;
        const url = `${devServer.https ? 'https' : 'http'}://${devServer.public}`;
        const building = ora({
          text: 'Waiting for initial build to finish',
          enabled: global.interactive
        });

        spinner.succeed(`Development server running on: ${url}`);
        building.start();
        compiler.plugin('done', () => {
          building.succeed('Build completed');
        });
        compiler.plugin('compile', debounce(() => {
          building.text = 'Source changed, re-compiling';
          building.start();
        }, 1000, { leading: true, maxWait: 1000 }));
      }
    }
  });
};
