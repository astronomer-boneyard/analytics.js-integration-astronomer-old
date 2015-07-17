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
  .tag('library', '<script src="https://sdk.amazonaws.com/js/aws-sdk-2.1.33.min.js">');

/**
 * Initialize astronomer.
 * @param {Facade} page The page object
 */
Astronomer.prototype.initialize = function() {
  var self = this;
  self.props = {};
  self.kinesis = {};
  self.kinesisQueue = async.queue(self.putRecord.bind(self), 1);

  console.log('Authenticating with ' + self.options.credentialServer);

  self.load('library', function() {
    self.kinesis = new window.AWS.Kinesis();
    self.ready();
  });

  // Load lib, auth, config, ready, dequeue
  // async.waterfall([
  //   self.loadAwsLib.bind(self),
  //   self.auth.bind(self)
  // ],
  // function(err, response) {
  //   self.configAws(response.body);
  //   self.setCredentialToken(response.body.credentials.Token);
  //   self.ready();
  //   self.dequeue();
  // });
};

/**
 * Load the aws library from CDN
 * @param {Function} callback Callback
 */
// Astronomer.prototype.loadAwsLib = function(callback) {
//   this.load('library', callback);
// };

/**
 * Authenticate with our server
 * @param {Function} callback Callback
 */
Astronomer.prototype.auth = function() {
  var self = this;
  self.kinesisQueue.pause();
  request.get('/api/v1/applications/credentials/' + self.options.appId)
    .use(prefix(self.options.credentialServer))
    .end(function(err, response) {
      self.config = response.body;
      window.AWS.config.update({
        region: self.config.region,
        credentials: new window.AWS.WebIdentityCredentials({
          RoleArn: self.config.roleArn,
          WebIdentityToken: self.config.credentials.Token,
          DurationSeconds: self.options.credentialsExpiration
        })
      });
      if (!err) {
        self.kinesisQueue.resume();
      }
    });
};

/**
 * Assign our kinesis object with a new one configured with new credentials
 * @param {Object} config Config object from our server
 */
// Astronomer.prototype.configAws = function(config) {
//   this.config = config;
//   this.kinesis = new window.AWS.Kinesis({
//     region: this.config.region,
//     credentials: new window.AWS.WebIdentityCredentials({
//       RoleArn: this.config.roleArn,
//       DurationSeconds: this.options.credentialsExpiration
//     })
//   });
// };

/**
 * Invalidate credentials and set new token
 * @param {String} token The new token
 */
// Astronomer.prototype.setCredentialToken = function(token) {
//   this.kinesis.config.credentials.expired = true;
//   this.kinesis.config.credentials.params.WebIdentityToken = token;
// };

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
  var id = identify.userId();
  var traits = identify.traits();
  this.props.userId = id;
  this.props.userProperties = traits;
};

/**
 * Associate the current user with a group of users.
 * @param {Facade} group A group object
 */
Astronomer.prototype.group = function(group) {
  var id = group.groupId();
  var traits = group.traits();
  this.props.groupId = id;
  this.props.groupProperties = traits;
};

/**
 * Track an event.
 * @param {Facade} track A track object
 */
Astronomer.prototype.track = function(track) {
  var self = this;

  var record = JSON.stringify({
    event: track.event(),
    properties: track.properties(),
    anonymousId: analytics.user().anonymousId(),
    userId: self.props.userId,
    traits: self.props.userProperties
  });

  console.log('track', self.kinesis.config.credentials);

  var expireTime = (self.kinesis.config.credentials || {}).expireTime;
  if (!expireTime || expireTime.getTime() <= Date.now()) {
    self.auth();
  }
  self.kinesisQueue.push(record);
};

Astronomer.prototype.putRecord = function(record, callback) {
  var params = {
    Data: record,
    StreamName: this.config.streamName,
    PartitionKey: this.options.appId
  };

  this.kinesis.putRecord(params, function(err, data) {
    console.log(err, data);
    callback();
  });
};
