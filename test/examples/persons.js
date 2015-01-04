/*jslint node: true */
var async = require('async');
var persons = require('./persons.json');

exports.setup = function(db, callback) {
  db.createDatabase(function(err) {
    if (err) return callback(err);

    db.CreateTable('person')
    .add([
      'id SERIAL PRIMARY KEY',
      'name TEXT',
      'age INTEGER',
    ])
    .execute(function(err) {
      if (err) return callback(err);

      async.eachSeries(persons, function(person, callback) {
        db.Insert('person').set(person).execute(callback);
      }, callback);
    });
  });
};

exports.teardown = function(db, callback) {
  db.dropDatabase(callback);
};
