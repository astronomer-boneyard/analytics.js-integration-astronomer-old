/* global analytics */
/* eslint no-console:0, no-unused-vars:0, no-extra-parens:0 */

'use strict';

var integration = require('analytics.js-integration');
var request = require('visionmedia/superagent');
var prefix = require('johntron/superagent-prefix');
var async = require('caolan/async');
window._astq = window._astq || [];

/**
 * Expose `Astronomer` integration.
 */
var Astronomer = module.exports = exports = integration('astronomer')
  .global('_astq')
  .option('appId', null)
  .option('credentialServer', 'https://app.astronomer.io:443')
  .option('credentialsExpiration', 900)
  .option('trackAllPages', false)
  .option('trackNamedPages', true)
  .option('trackCategorizedPages', true)
  .tag('aws', '<script src="https://sdk.amazonaws.com/js/aws-sdk-2.1.33.min.js">');

/**
 * Initialize astronomer.
 * @param {Facade} page The page object
 */
Astronomer.prototype.initialize = function() {
  var self = this;
  // Hold user data
  self.props = {};
  // The kinesis service object
  self.kinesis = null;
  // Need concurrency 1 here to prevent multiple auth requests simultaneously
  self.queue = async.queue(self.putRecord.bind(self), 1);
  // Load aws sdk, then signal ready
  self.load('aws', function() {
    self.ready();
    self.replay();
  });
};

/**
 * Authenticate with our server
 * @param {Function} callback Callback
 */
Astronomer.prototype.ensureKinesisConfig = function(callback) {
  var self = this;

  if (!self.expired()) {
    callback(null, { config: self.config, kinesis: self.kinesis });
    return;
  }

  // Request fresh config (token)
  self.requestConfig(function(err, response) {
    if (err) { return callback(err); }

    // Update global config object
    self.config = response.body;

    var params = {
      region: self.config.region,
      credentials: new window.AWS.WebIdentityCredentials({
        RoleArn: self.config.roleArn,
        WebIdentityToken: self.config.credentials.Token,
        DurationSeconds: self.options.credentialsExpiration
      })
    };

    // Assign kinesis service object to new one with fresh config
    self.kinesis = new window.AWS.Kinesis(params);

    callback(null, { config: self.config, kinesis: self.kinesis });
  });
};

/**
 * Check credentials on kinesis service object
 * @return {Boolean} If expired
 */
Astronomer.prototype.expired = function() {
  var expireTime = (((this.kinesis || {}).config || {}).credentials || {}).expireTime;
  return !expireTime || expireTime.getTime() <= Date.now();
};

/**
 * Worker handler function
 * @param {Object} record Record to put to kinesis
 * @param {Function} callback Function to callback to queue
 */
Astronomer.prototype.putRecord = function(record, callback) {
  var self = this;
  self.ensureKinesisConfig(function(err, config) {
    if (err) {
      console.error("Error retrieving config.");
      return callback();
    }

    var params = {
      Data: record,
      StreamName: config.config.streamName,
      PartitionKey: self.options.appId
    };

    config.kinesis.putRecord(params, function(err, data) {
      if (err) {
        console.log(err);
      }
      callback();
    });
  });
};

/**
 * Request new configuration from server, including fresh token
 * @param {Function} callback Callback passing in response
 */
Astronomer.prototype.requestConfig = function(callback) {
  request.get('/api/v1/applications/credentials/' + this.options.appId)
    .use(prefix(this.options.credentialServer))
    .end(callback);
};

/**
 * Replay the events that have been queued prior to initialization
 */
Astronomer.prototype.replay = function() {
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
 * @param {Facade} page A page object
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
 * @param {Facade} identify An identify object
 */
Astronomer.prototype.identify = function(identify) {
  this.push(identify.json());
  // var id = identify.userId();
  // var traits = identify.traits();
  // this.props.userId = id;
  // this.props.userProperties = traits;
};

/**
 * Associate the current user with a group of users.
 * @param {Facade} group A group object
 */
// Astronomer.prototype.group = function(group) {
//   var id = group.groupId();
//   var traits = group.traits();
//   this.props.groupId = id;
//   this.props.groupProperties = traits;
// };

/**
 * Track an event.
 * @param {Facade} track A track object
 */
Astronomer.prototype.track = function(track) {
  this.push(track.json());
};

/**
 * Push a message to the outgoing queue.
 * @param {Object} msg
 */
Astronomer.prototype.push = function(msg) {
  // var record = JSON.stringify({
  //   event: track.event(),
  //   properties: track.properties(),
  //   anonymousId: analytics.user().anonymousId(),
  //   userId: this.props.userId,
  //   traits: this.props.userProperties
  // });
  msg = this.normalize(msg);
  // this.queue.push(msg);
};

/**
 * Normalize a given msg.
 * @param {Object} msg
 */
Astronomer.prototype.normalize = function(msg) {
  var user = this.analytics.user();
  console.log(user);
  console.log(msg);
  console.log('-------------------------------');
  // msg.userId = msg.userId || user.id();
  // msg.anonymousId = user.anonymousId();

};