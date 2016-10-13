/* global Promise */
/* jshint node: true */

var xcodeUtil = require('../../devkit-core/modules/native-ios/lib/xcodeUtil'),
  updatePlist = require('../../devkit-core/modules/native-ios/lib/updatePlist'),
  Rsync = require('rsync'),
  path = require("path");

exports.onBeforeBuild = function (api, app, config, cb) {
  'use strict';

  var widgetID = app.manifest.ios.widgetID || 'widget',
    widgetGroup = app.manifest.ios.widgetGroup || 'group.' + config.bundleID;

  cb();

  if (config.target !== 'native-ios') {
    return;
  }

  api.streams.registerFunction('ios-build-widget', function () {
    var xcodeProjectPath = config.xcodeProjectPath;
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
        var entitlements = updatePlist.get(path.join(xcodeProjectPath, 'TeaLeafIOS.entitlements'));
        var widgetPlist = updatePlist.getInfoPlist(xcodeProjectPath + '/widget');
        var raw = widgetPlist.getRaw();
        raw.CFBundleDisplayName = app.manifest.title || "";
        raw.CFBundleIdentifier = config.bundleID + '.' + widgetID;
        raw.WidgetGroup = widgetGroup;

        var rawEntitlements = entitlements.getRaw();
        rawEntitlements['com.apple.security.application-groups'] = [widgetGroup];

        var widgetEntitlements = updatePlist.get(config.xcodeProjectPath + '/widget/widget.entitlements');
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
