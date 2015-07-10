/* global analytics */
/* eslint no-console:0, no-unused-vars:0, no-extra-parens:0 */

'use strict';

var integration = require('analytics.js-integration');
var request = require('visionmedia/superagent');
var prefix = require('johntron/superagent-prefix');

/**
 * Expose `Astronomer` integration.
 */

window._astq = window._astq || [];

var Astronomer = module.exports = exports = integration('astronomer')
  .global('_astronomer')
  .global('_astq')
  .option('appId', null)
  .opyion('credentialServer', 'https://app.astronomer.io:443')
  // .option('streamName', null)
  // .option('roleArn', null)
  // .option('token', null)
  // .option('region', null)
  .option('trackAllPages', false)
  .option('trackNamedPages', true)
  .option('trackCategorizedPages', true)
  .tag('library', '<script src="https://sdk.amazonaws.com/js/aws-sdk-2.1.33.min.js">');

/**
 * Initialize astronomer.
 *
 * @param {Facade} page
 */

Astronomer.prototype.initialize = function() {
  var self = this;

  this.load('library', function() {
    // Setup global kinesis object
    window._astronomer = {};
    window._astronomer.kinesis = new window.AWS.Kinesis();

    var appId = self.options.appId;
    var credentialServer = self.options.credentialServer;

    /** Get token from app server */
    request
      .get('/api/v1/applications/credentials/' + appId)
      .use(prefix(credentialServer))
      .end(function(err, res) {
        window._astronomer.config = res.body;

        /** Then exchange token for credentials **/
        var credentials = new window.AWS.WebIdentityCredentials({
          RoleArn: res.body.roleArn,
          WebIdentityToken: res.body.credentials.Token
        });

        window.AWS.config.region = res.body.region;
        window.AWS.config.credentials = credentials;

        window.AWS.config.credentials.get(function(err) {
          if (err) {
            console.error(err);
          } else {
            // Ready for events
            self.ready();

            // If any events have been placed in the queue, replay them now
            while (window._astq.length > 0) {
              var item = window._astq.shift();
              var method = item.shift();
              if (analytics[method]) analytics[method].apply(analytics, item);
            }
          }
        });
      });
  });
};

/**
 * Has the astronomer library been loaded yet?
 *
 * @return {Boolean}
 */

Astronomer.prototype.loaded = function() {
  return !!((((window.AWS) || {}).config || {}).credentials || {}).accessKeyId;
};
/**
 * Trigger a page view.
 *
 * @param {Facade} identify
 */

Astronomer.prototype.page = function(page) {
  var category = page.category();
  var props = page.properties();
  var name = page.fullName();
  var opts = this.options;

  // all pages
  if (opts.trackAllPages) {
    this.track(page.track());
  }

  // named pages
  if (name && opts.trackNamedPages) {
    this.track(page.track(name));
  }

  // categorized pages
  // if (category && opts.trackCategorizedPages) {
  //   this.track(page.track(category));
  // }
};

/**
 * Identify a user.
 *
 * @param {Facade} identify
 */

Astronomer.prototype.identify = function(identify) {
  var id = identify.userId();
  var traits = identify.traits();
  window._astronomer.userId = id;
  window._astronomer.userProperties = traits;
};

/**
 * Associate the current user with a group of users.
 *
 * @param {Facade} group
 */

Astronomer.prototype.group = function(group) {
  var id = group.groupId();
  var traits = group.traits();
  window._astronomer.groupId = id;
  window._astronomer.groupProperties = traits;
};

/**
 * Track an event.
 *
 * @param {Facade} track
 */

Astronomer.prototype.track = function(track) {
  var record = JSON.stringify({
    event: track.event(),
    properties: track.properties(),
    userId: window._astronomer.userId,
    anonymousId: analytics.user().anonymousId(),
    traits: window._astronomer.userProperties
  });

  var params = {
    Data: record,
    StreamName: window._astronomer.config.streamName,
    PartitionKey: this.options.appId
  };

  window._astronomer.kinesis.putRecord(params, function(error, data) {
    if (error) {
      console.error(error);
    }
  });
};
