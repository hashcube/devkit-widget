/* jshint node: true */
var xcodeUtil = require('../../devkit-core/modules/native-ios/lib/xcodeUtil');
var updatePlist = require('../../devkit-core/modules/native-ios/lib/updatePlist');
var Rsync = require('rsync');
var path = require("path");

exports.onBeforeBuild = function (api, app, config, cb) {
  'use strict';

  var bundle_id = config.bundleID,
    out_path = config.outputPath,
    widget_id = app.manifest.ios.widgetID || 'widget',
    widget_group = app.manifest.ios.widgetGroup || 'group.' + bundle_id;

  if (config.target === 'native-ios') {
    console.log('============');
    console.log(bundle_id, widget_id, widget_group, out_path);
  }

  cb();

  api.streams.registerFunction('ios-build-widget', function () {
    console.log('\n\n\n\n\n----------------------------here!');

    var projectPath = config.xcodeProjectPath;

    return new Promise(function () {
        var rsync = new Rsync()
          .flags('a')
          .set('delete-before')
          .source(path.resolve(__dirname, '../ios/widget'))
          .destination(projectPath);

        return Promise.fromNode(rsync.execute.bind(rsync));
      }).then(function () {
        return xcodeUtil.getXcodeProject(projectPath)
          .then(function (xcodeProject) {
          });
      });
  });
};
