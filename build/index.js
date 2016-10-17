/* global Promise */
/* jshint node: true */

var xcodeUtil = require('../../devkit-core/modules/native-ios/lib/xcodeUtil'),
  updatePlist = require('../../devkit-core/modules/native-ios/lib/updatePlist'),
  Rsync = require('rsync'),
  module_config = require("../widget/config"),
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
    var xcodeProjectPath = config.xcodeProjectPath,
      groupKey, target;

    return Promise
      .resolve()
      .then(function () {
        var rsync = new Rsync()
          .flags('a')
          .set('delete-before')
          .source(path.resolve(__dirname, '../widget'))
          .destination(xcodeProjectPath);

        return Promise.fromNode(rsync.execute.bind(rsync));
      })
      .then(function () {
        return xcodeUtil.getXcodeProject(xcodeProjectPath);
      })
      .then(function (xcodeProject) {
        var project = xcodeProject._project,
          firstProject = project.getFirstProject().firstProject,
          firstTarget = project.getFirstTarget().firstTargetUuid;

        target = project.addTarget('widget', 'app_extension', 'widget');
        // create widget group
        groupKey = project.pbxCreateGroup('widget', 'widget');
        // Add newly created widget group to the main group
        project.addToPbxGroup({
          fileRef: groupKey,
          basename: 'widget'
        }, firstProject.mainGroup);

        // add widget as a build dependency for the app
        project.addTargetDependency(firstTarget, [target]);

        project.addBuildProperty('CODE_SIGN_IDENTITY', 'iPhone Developer');
        project.addBuildProperty('IPHONEOS_DEPLOYMENT_TARGET', 8.0);
        project.addBuildProperty('TARGETED_DEVICE_FAMILY', '"1,2"');

        return xcodeProject;
      })
      .then(function (xcodeProject) {
        var project = xcodeProject._project;

        // Add files
        module_config.code.forEach(function(file) {
          if (isHeaderFile(file)) {
            project.addHeaderFile(file, {target: target.uuid}, groupKey);
          } else if (isSourceFile(file)) {
            project.addSourceFile(file, {target: target.uuid, ext: true}, groupKey);
          } else {
            console.warn('Skipping unknown code file type', file);
          }
        });

        // Add resources
        module_config.resources.forEach(function(resource) {
          xcodeProject._project.addResourceFile(resource, {target: target.uuid, ext: true}, 'widget');
        });

        // Add frameworks
        module_config.frameworks.forEach(function(framework) {
          xcodeProject._project.addFramework(framework, {link: true, target: target.uuid, ext: true});
        });
        return xcodeProject;
      })
      .then(function (xcodeProject) {
        xcodeProject.write();
      })
      .then(function () {
        // Update plist and entitlements
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
