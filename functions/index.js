const functions = require("firebase-functions");
const app = require("express")();
const FBAuth = require("./util/fbAuth");
const cors = require("cors");
app.use(cors());
const { db } = require("./util/admin");
const {
  getAllPosts,
  createNewPost,
  getPost,
  commentOnPost,
  likePost,
  unlikePost,
  deletePost,
} = require("./handlers/posts");
const {
  signup,
  login,
  uploadImage,
  addUserDetails,
  getOwnAuthenticatedUser,
  getUser,
  markNotificationsRead,
} = require("./handlers/users");

//Post endpoints
app.get("/posts", getAllPosts);
app.post("/post", FBAuth, createNewPost);
app.delete("/post/:postId", FBAuth, deletePost); //colon used to indicate parameter
app.get("/post/:postId", getPost);
app.get("/post/:postId/like", FBAuth, likePost);
app.get("/post/:postId/unlike", FBAuth, unlikePost);
app.post("/post/:postId/comment", FBAuth, commentOnPost);

//User endpoints
app.post("/signup", signup);
app.post("/login", login);
app.post("/user/image", FBAuth, uploadImage);
app.post("/user", FBAuth, addUserDetails);
app.get("/user", FBAuth, getOwnAuthenticatedUser);
app.get("/user/:handle", getUser);
app.post("/notifications", FBAuth, markNotificationsRead);

// Creates an endpoint named api where we can append endpoints onto
exports.api = functions.https.onRequest(app);

/*-------------------------------Trigger functions for like/unlike/comment notifications---------------------------------- */

exports.createNotificationOnLike = functions.firestore
  .document("likes/{id}")
  .onCreate((likeDoc) => {
    return db
      .doc(`/posts/${likeDoc.data().postId}`)
      .get()
      .then((postDoc) => {
        if (
          postDoc.exists &&
          postDoc.data().userHandle !== likeDoc.data().userHandle
        ) {
          return db.doc(`/notifications/${likeDoc.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: postDoc.data().userHandle,
            sender: likeDoc.data().userHandle,
            type: "like",
            read: false,
            postId: postDoc.id,
          });
        }
      })
      .then(() => {
        console.log("Notification created succesfully");
      })
      .catch((err) => {
        console.error(err);
      });
  });

exports.deleteNotificationOnUnlike = functions.firestore
  .document("likes/{id}")
  .onDelete((likeDoc) => {
    return db
      .doc(`/notifications/${likeDoc.id}`)
      .delete()
      .then(() => {
        console.log("Notification deleted succesfully");
      })
      .catch((err) => {
        console.error(err);
      });
  });

exports.createNotificationOnComment = functions.firestore
  .document("comments/{id}")
  .onCreate((commentDoc) => {
    return db
      .doc(`/posts/${commentDoc.data().postId}`)
      .get()
      .then((postDoc) => {
        if (
          postDoc.exists &&
          postDoc.data().userHandle !== commentDoc.data().userHandle
        ) {
          return db.doc(`/notifications/${commentDoc.id}`).set({
            createdAt: new Date().toISOString(),
            recipient: postDoc.data().userHandle,
            sender: commentDoc.data().userHandle,
            type: "comment",
            read: false,
            postId: postDoc.id,
          });
        }
      })
      .then(() => {
        console.log("Comment notification created succesfully!");
      })
      .catch((err) => {
        console.error(err);
      });
  });

exports.onUserProfilePicChange = functions.firestore
  .document("users/{userId}")
  .onUpdate((change) => {
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      const batch = db.batch();
      return db
        .collection("posts")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then((postDocArr) => {
          postDocArr.forEach((postDoc) => {
            const post = db.doc(`/posts/${postDoc.id}`);
            batch.update(post, { userImage: change.after.data().imageUrl });
          });
          return batch.commit();
        });
    } else return true;
  });

exports.onPostDelete = functions.firestore
  .document("posts/{postId}")
  .onDelete((postDoc, context) => {
    const postId = context.params.postId;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("postId", "==", postId)
      .get()
      .then((commentDocArr) => {
        commentDocArr.forEach((commentDoc) => {
          batch.delete(db.doc(`/comments/${commentDoc.id}`));
        });
        return db.collection("likes").where("postId", "==", postId).get();
      })
      .then((likeDocArr) => {
        likeDocArr.forEach((likeDoc) => {
          batch.delete(db.doc(`/likes/${likeDoc.id}`));
        });
        return db
          .collection("notifications")
          .where("postId", "==", postId)
          .get();
      })
      .then((notificationDocArr) => {
        notificationDocArr.forEach((notificationDoc) => {
          batch.delete(db.doc(`/notifications/${notificationDoc.id}`));
        });
        return batch.commit();
      })
      .catch((err) => console.error(err));
  });
