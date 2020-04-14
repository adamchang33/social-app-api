const { db, admin } = require("./admin");

// Authentication middleware
module.exports = (req, res, next) => {
  let idToken;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    idToken = req.headers.authorization.split("Bearer ")[1];
  } else {
    console.error("No token found");
    return res.status(403).json({ error: "Unauthorized" });
  }

  admin
    .auth()
    .verifyIdToken(idToken)
    // DecodedToken is information about the user to whom the token belongs to
    .then(decodedToken => {
      req.user = decodedToken;
      // Query database to find user handle
      return db
        .collection("users")
        .where("userId", "==", req.user.uid)
        .limit(1)
        .get();
      //data is user return from query (array of docs)
    })
    .then(data => {
      req.user.handle = data.docs[0].data().handle;
      req.user.imageUrl = data.docs[0].data().imageUrl;
      return next();
    })
    .catch(err => {
      console.error("Error while verifying token");
      return res.status(403).json(err);
    });
};
