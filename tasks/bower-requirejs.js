'use strict';
module.exports = function (grunt) {
	var requirejs = require('requirejs/bin/r.js');
	var path = require('path');
	var _ = grunt.util._;

	grunt.registerMultiTask('bower', 'Wire-up Bower components in RJS config', function () {
		var cb = this.async();
		var excludes = this.options({exclude: []}).exclude;

		var htmlFilePath = this.data.html;
		var htmlFile;
		var configFilePath = this.data.rjsConfig;
		var configFile;
		var baseDir;

		if (htmlFilePath) {
			// Prefer an `html` property.
			htmlFile = grunt.file.read(htmlFilePath);
			findConfigFile();
		}

		if (!configFile && configFilePath) {
			// Try the `rjsConfig` path.
			configFile = grunt.file.read(configFilePath);
			baseDir = path.dirname(configFilePath);
		}

		if (!configFile) {
			// Nothing? How rude.
			return cb();
		}

		// find config file based on the script include's data-main property
		function findConfigFile() {
			var dataMainPath = htmlFile.match(/<script[^>]*data-main=[^\w]*([\w|\/]+)/);
			if (!dataMainPath) {
				return;
			}
			// Find the base directory.
			baseDir = path.dirname(htmlFilePath);
			configFilePath = configFilePath || path.join(path.dirname(htmlFilePath), dataMainPath[1] + '.js');
			configFile = grunt.file.read(configFilePath);
		}


		// remove extensions from js files but ignore folders
		function stripJS(val) {
			var newPath;
			if (grunt.file.isDir(val)) {
				grunt.log.writeln('Warning: ' + val + ' does not specify a .js file in main');
				newPath = val;
			} else {
				newPath = path.join(path.dirname(val), path.basename(val, '.js'));
			}
			return newPath;
		}

		// find script relative to config file
		function baseDirRelativeFileSearch(baseUrl, file) {
			var jspath;
			if (baseUrl) {
				jspath = path.relative(path.join(baseDir, baseUrl), file);
			} else {
				jspath = path.relative(baseDir, file);
			}
			return jspath;
		}

		require('bower').commands.list({paths: true})
			.on('data', function (data) {
				var rjsConfig;

				if (data) {
					// remove excludes and clean up key names
					data = _.forOwn(data, function (val, key, obj) {
						if (excludes.indexOf(key) !== -1 || key === 'requirejs') {
							delete obj[key];
							return;
						}

						// clean up path names like 'typeahead.js'
						// when requirejs sees the .js extension it will assume
						// an absolute path, which we don't want.
						if (key.indexOf('.js') !== -1) {
							var newKey = key.replace(/\.js$/, '');
							obj[newKey] = obj[key];
							delete obj[key];
							grunt.log.writeln('Warning: Renaming ' + key + ' to ' + newKey);
						}
					});

					requirejs.tools.useLib(function (require) {
						rjsConfig = require('transform').modifyConfig(configFile, function (config) {
							_.forOwn(data, function(val, key, obj) {
								// if main is not an array convert it to one so we can
								// use the same process throughout
								if (!_.isArray(val)) {
									val = [val];
								}

								// iterate through the main array and filter it down
								// to only .js files
								var jsfiles = _.filter(val, function(inval) {
									return path.extname(inval) === '.js';
								});

								// if there are no js files in main, delete
								// the path and return
								if (!jsfiles.length) {
									delete obj[key];
									return;
								}

								// strip out any .js file extensions to make
								// requirejs happy
								jsfiles = _.map(jsfiles, stripJS);

								// if there were multiple js files create a path
								// for each using its filename.
								var jspath;
								if (jsfiles.length > 1) {
									// remove the original key to array relationship since we're
									// splitting the component into multiple paths
									delete obj[key];
									_.forEach(jsfiles, function (jsfile) {
										var jspath = baseDirRelativeFileSearch(config.baseUrl, jsfile);
										obj[path.basename(jspath).split('.')[0]] = jspath;
									});
								// if there was only one js file create a path
								// using the key
								} else {
									obj[key] = baseDirRelativeFileSearch(config.baseUrl, jsfiles[0]);
								}
							});

							_.extend(config.paths, data);
							return config;
						});

						grunt.file.write(configFilePath, rjsConfig);
						grunt.log.writeln('Updated RequireJS config with installed Bower components'.green);
						cb();
					});
				}
			})
			.on('error', function (err) {
				grunt.warn(err.message);
				cb();
			});
	});
};
