/* global analytics */
/* eslint no-console:0, no-unused-vars:0, no-extra-parens:0 */

'use strict';

var integration = require('analytics.js-integration');
var request = require('visionmedia/superagent');
var prefix = require('johntron/superagent-prefix');
var async = require('caolan/async');

/**
 * Expose `Astronomer` integration.
 */

window._astq = window._astq || [];

var Astronomer = module.exports = exports = integration('astronomer')
  .global('_astronomer')
  .global('_astq')
  .option('appId', null)
  .option('credentialServer', 'https://app.astronomer.io:443')
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
  window._astronomer = {};

  async.waterfall([
    self.loadAwsLib.bind(this),
    self.auth.bind(this)
], function(err, response) {
    if (err) {
      return console.error(err);
    }
    self.configAws(response.body);
    self.ready();
    self.dequeue();
  });

  setInterval(function() {
    console.log('enter interval');
    async.retry(3, self.auth.bind(self), function(response) {
      console.log(response);
      self.configAws(response.body);
    });
  }, 30000);
};

/**
 * Load the aws library from CDN
 * @param {Function} callback Callback
 */
Astronomer.prototype.loadAwsLib = function(callback) {
  this.load('library', callback);
};

/**
 * Authenticate with our server
 * @param {Function} callback Callback
 */
Astronomer.prototype.auth = function(callback) {
  console.log('Authenticating with ' + this.options.credentialServer);
  request
    .get('/api/v1/applications/credentials/' + this.options.appId)
    .use(prefix(this.options.credentialServer))
    .end(callback);
};

/**
 * Assign our kinesis object with a new one configured with new credentials
 * @param {Object} config Config object from our server
 */
Astronomer.prototype.configAws = function(config) {
  window._astronomer.config = config;
  window._astronomer.kinesis = new window.AWS.Kinesis({
    region: window._astronomer.config.region,
    credentials: new window.AWS.WebIdentityCredentials({
      RoleArn: window._astronomer.config.roleArn,
      WebIdentityToken: window._astronomer.config.credentials.Token,
      DurationSeconds: 900
    })
  });
};

/**
 * Replay the queue
 */
Astronomer.prototype.dequeue = function() {
  while (window._astq.length > 0) {
    var item = window._astq.shift();
    var method = item.shift();
    if (analytics[method]) analytics[method].apply(analytics, item);
  }
};


/**
 * Has the astronomer library been loaded yet?
 * @return {Boolean}
 */

Astronomer.prototype.loaded = function() {
  return !!((((window.AWS) || {}).config || {}).credentials || {}).accessKeyId;
};
/**
 * Trigger a page view.
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

  console.log(window._astronomer.kinesis.config.credentials);

  window._astronomer.kinesis.putRecord(params, function(error, data) {
    if (error) {
      console.error(error);
    }
  });
};
