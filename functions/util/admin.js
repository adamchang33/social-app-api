/* Admin sdk to access database */
var admin = require("firebase-admin");

/* Firebase serve
var serviceAccount = require("/Users/adamchang33/Desktop/serviceAcountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://fir-proj-2e99b.firebaseio.com"
});
*/

/* Firebase deploy */
admin.initializeApp();

//reference db
const db = admin.firestore();

module.exports = { admin, db };
