import persons from './persons.json';

export function setup(db, callback) {
  db.createDatabase(err => {
    if (err) return callback(err);

    db.CreateTable('person')
    .add('id SERIAL PRIMARY KEY', 'name TEXT', 'age INTEGER')
    .executePromise()
    .then(() => {
      let promises = persons.map(person => {
        return db.Insert('person').set(person).executePromise();
      });
      return Promise.all(promises);
    })
    .then(() => callback(), reason => callback(reason));
  });
}

export function teardown(db, callback) {
  db.dropDatabase(callback);
}
