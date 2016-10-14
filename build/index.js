/* global Promise */
/* jshint node: true */

var xcodeUtil = require('../../devkit-core/modules/native-ios/lib/xcodeUtil'),
  updatePlist = require('../../devkit-core/modules/native-ios/lib/updatePlist'),
  Rsync = require('rsync'),
  module_config = require("../ios/config"),
  path = require("path");

var isHeaderFile = function(filename) {
  return (/\.h(pp)?$/).test(filename);
};

var isSourceFile = function(filename) {
  return (/\.(c(pp)?)|mm?$/).test(filename);
};

exports.onBeforeBuild = function (api, app, config, cb) {
  'use strict';

  var widgetID = app.manifest.ios.widgetID || 'widget',
    widgetGroup = app.manifest.ios.widgetGroup || 'group.' + config.bundleID,
    manifest = app.manifest,
    version = manifest.ios && manifest.ios.version || manifest.version || '0.0.0',
    buildNumber = manifest.ios && manifest.ios.buildNumber || version;

  cb();

  if (config.target !== 'native-ios') {
    return;
  }

  api.streams.registerFunction('ios-build-widget', function () {
    var xcodeProjectPath = config.xcodeProjectPath;
    var groupKey, target;
    console.log('\n\n\n\n\n----------------------------');

    return Promise
      .resolve()
      .then(function () {
        var rsync = new Rsync()
          .flags('a')
          .set('delete-before')
          .source(path.resolve(__dirname, '../ios/widget'))
          .destination(xcodeProjectPath);

        return Promise.fromNode(rsync.execute.bind(rsync));
      })
      .then(function () {
        return xcodeUtil.getXcodeProject(xcodeProjectPath);
      })
      .then(function (xcodeProject) {
        var proj = xcodeProject._project.getFirstProject();

        target = xcodeProject._project.addTarget('widget', 'app_extension', 'widget');
        // create widget group
        groupKey = xcodeProject._project.pbxCreateGroup('widget', 'widget');
        // Add newly created widget group to the main group
        xcodeProject._project.addToPbxGroup({
          fileRef: groupKey,
          basename: 'widget'
        }, proj.firstProject.mainGroup);

        return xcodeProject;
      })
      .then(function (xcodeProject) {
        module_config.code.forEach(function(file) {
          if (isHeaderFile(file)) {
            xcodeProject._project.addHeaderFile(file, {target: target.uuid}, groupKey);
          } else if (isSourceFile(file)) {
            xcodeProject._project.addSourceFile(file, {target: target.uuid, ext: true}, groupKey);
          } else {
            console.warn('Skipping unknown code file type', file);
          }
        });
        return xcodeProject;
      })
      .then(function (xcodeProject) {
        module_config.resources.forEach(function(resource) {
          xcodeProject._project.addResourceFile(resource, {target: target.uuid, ext: true}, 'widget');
        });
        return xcodeProject;
      })
      .then(function (xcodeProject) {
        module_config.frameworks.forEach(function(framework) {
          xcodeProject._project.addFramework(framework, {link: true, target: target.uuid, ext: true});
        });
        return xcodeProject;
      })
      .then(function (xcodeProject) {
        xcodeProject.write();
      })
      .then(function () {
        // Teleaf entitlements
        var entitlements = updatePlist.get(path.join(xcodeProjectPath, 'TeaLeafIOS.entitlements'));
        var rawEntitlements = entitlements.getRaw();
        rawEntitlements['com.apple.security.application-groups'] = [widgetGroup];

        // Widget Plist
        var widgetPlist = updatePlist.getInfoPlist(path.join(xcodeProjectPath, 'widget'));
        var raw = widgetPlist.getRaw();
        raw.CFBundleDisplayName = app.manifest.title || "";
        raw.CFBundleIdentifier = config.bundleID + '.' + widgetID;
        raw.CFBundleShortVersionString = version;
        raw.CFBundleVersion = buildNumber + "";
        raw.WidgetGroup = widgetGroup;

        // Widget Entitlements
        var widgetEntitlements = updatePlist.get(path.join(config.xcodeProjectPath, 'widget', 'widget.entitlements'));
        var rawWidgetEntitlements = widgetEntitlements.getRaw();
        rawWidgetEntitlements['com.apple.security.application-groups'] = [widgetGroup];

        return [
          entitlements.write(),
          widgetPlist.write(),
          widgetEntitlements.write()
        ];
      })
      .all();
  });
};
