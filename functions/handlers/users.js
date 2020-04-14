const { admin, db } = require("../util/admin");
const config = require("../util/config");
const {
  validateSignupData,
  validateLoginData,
  reduceUserDetails
} = require("../util/validators");

const firebase = require("firebase");
firebase.initializeApp(config);
/*--------------------------------Signup endpoint------------------------------------- */
exports.signup = (req, res) => {
  //create new user object and populate it with data from request
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmpassword: req.body.confirmpassword,
    handle: req.body.handle
  };

  const { valid, errors } = validateSignupData(newUser);
  if (!valid) return res.status(400).json(errors);

  const noImg = "blank-profile-pic.png";

  //TODO: Validate Data
  let token, userId;
  db.doc(`/users/${newUser.handle}`)
    .get()
    .then(doc => {
      //If handle already excists, return response with error code 400 and message handle already taken
      if (doc.exists) {
        return res.status(400).json({
          handle: "Handle already taken"
        });
        //otherwise if handle is available, create new user with email and password
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    // save the userID field of the createUser response sent back
    .then(newUserData => {
      userId = newUserData.user.uid;
      return newUserData.user.getIdToken();
    })
    // save the token of the getToken response sent back
    .then(userToken => {
      token = userToken;
      //create new userCredential object and populate using
      //handle and email from signup endpoint request,
      //userId from  createUser response,
      //token from getToken response,

      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId
      };
      // create new user doc using userCredential object
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      // respond with a token for the new user
      return res.status(201).json({
        token
      });
    })
    .catch(err => {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({ email: "Email is already in use" });
      } else {
        res
          .status(500)
          .json({ general: "Something went wrong, please try again" });
      }
    });
};

/*--------------------------------Login endpoint------------------------------------- */
exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  };

  const { valid, errors } = validateLoginData(user);
  if (!valid) return res.status(400).json(errors);

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(userData => {
      return userData.user.getIdToken();
    })
    .then(token => {
      return res.json({ token });
    })
    .catch(err => {
      console.error(err);
      return res
        .status(403)
        .json({ general: "Incorrect credentials. Please try again" });
    });
};

/*--------------------------------Upload profile pic endpoint------------------------------------- */
exports.uploadImage = (req, res) => {
  console.log("EXECUTED 1");
  //library to upload image
  const BusBoy = require("busboy");
  //default packages
  const path = require("path");
  //operating system library, used for file path generation
  const os = require("os");
  //file system library
  const fs = require("fs");

  const busboy = new BusBoy({ headers: req.headers });

  let imageFileName;
  let imageToBeUploaded = {};

  // Create file in cloud
  busboy.on("file", (feildname, file, filename, encoding, mimetype) => {
    //make usre only jpeg and pngs are allowed
    if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
      return res.status(400).json({ error: "File type not supported" });
    }

    // Extract file extension from file and then give random name to new file with extension
    const imageExtension = filename.split(".")[filename.split(".").length - 1];
    imageFileName = `${Math.round(Math.random() * 1000000)}.${imageExtension}`;
    // Create path for the file using filename we created and tmpdir because its cloud function
    const filepath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filepath, mimetype };
    //use file system to create file
    file.pipe(fs.createWriteStream(filepath));
  });

  // Upload file to firebase bucket
  busboy.on("finish", () => {
    admin
      .storage()
      .bucket()
      .upload(imageToBeUploaded.filepath, {
        resumeable: false,
        metadata: {
          metadata: {
            contentType: imageToBeUploaded.mimetype
          }
        }
      })
      .then(() => {
        console.log("EXECUTED 2");

        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: "Image uploaded successfully" });
      })
      .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code });
      });
  });
  busboy.end(req.rawBody);
};

/*--------------------------------Add user detail endpoint------------------------------------- */
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);

  db.doc(`/users/${req.user.handle}`)
    .update(userDetails)
    .then(() => {
      return res.json({ message: "Details added succesffuly" });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

/*--------------------------------Get own authenticated user details endpoint------------------------------------- */
exports.getOwnAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db
          .collection("likes")
          .where("userHandle", "==", req.user.handle)
          .get();
      }
    })
    .then(data => {
      userData.likes = [];
      data.forEach(doc => {
        userData.likes.push(doc.data());
      });
      return db
        .collection("notifications")
        .where("recipient", "==", req.user.handle)
        .orderBy("createdAt", "desc")
        .get();
    })
    .then(likeDocArr => {
      userData.notifications = [];
      likeDocArr.forEach(likeDoc => {
        userData.notifications.push({
          recipient: likeDoc.data().recipient,
          sender: likeDoc.data().sender,
          createdAt: likeDoc.data().createdAt,
          postId: likeDoc.data().postId,
          type: likeDoc.data().type,
          read: likeDoc.data().read,
          notificationId: likeDoc.id
        });
      });
      return res.json(userData);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

/*--------------------------------Get any users details endpoint------------------------------------- */
exports.getUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.handle}`)
    .get()
    .then(userDoc => {
      if (userDoc.exists) {
        userData.user = userDoc.data();
        return db
          .collection("posts")
          .where("userHandle", "==", req.params.handle)
          .orderBy("createdAt", "desc")
          .get();
      } else {
        return res.status(404).json({ error: "User not found" });
      }
    })
    .then(postDocArr => {
      userData.posts = [];
      postDocArr.forEach(postDoc => {
        userData.posts.push({
          body: postDoc.data().body,
          createdAt: postDoc.data().createdAt,
          userHandle: postDoc.data().userHandle,
          userImage: postDoc.data().userImage,
          likeCount: postDoc.data().likeCount,
          commentCount: postDoc.data().commentCount,
          postId: postDoc.id
        });
      });
      return res.json(userData);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};

/*--------------------------------Mark notifications read endpoint------------------------------------- */
exports.markNotificationsRead = (req, res) => {
  let notificationBatch = db.batch();
  req.body.forEach(notificationId => {
    const notificationDoc = db.doc(`/notifications/${notificationId}`);
    notificationBatch.update(notificationDoc, { read: true });
  });
  notificationBatch
    .commit()
    .then(() => {
      return res.json({ message: "Notifications marked read" });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
};
