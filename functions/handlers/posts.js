const { db } = require("../util/admin");
const { FBAuth } = require("../util/fbAuth");

/*--------------------------------Get all posts endpoint------------------------------------- */
exports.getAllPosts = (req, res) => {
  // Access post collection and get query snapshot which contains an array of docs
  db.collection("posts")
    .orderBy("createdAt", "desc")
    .get()
    //data is object that is fetched from the database
    .then((postDocArr) => {
      let posts = [];
      //for each data(doc) object, create a post object using its data field
      postDocArr.forEach((postDoc) => {
        posts.push({
          postId: postDoc.id,
          body: postDoc.data().body,
          userHandle: postDoc.data().userHandle,
          createdAt: postDoc.data().createdAt,
          commentCount: postDoc.data().commentCount,
          likeCount: postDoc.data().likeCount,
          userImage: postDoc.data().userImage,
        });
      });
      // Format the response as a JSON object and send back the array of post objects
      return res.json(posts);
    })
    .catch((err) => console.error(err));
};

/*--------------------------------Create new post endpoint------------------------------------- */
exports.createNewPost = (req, res) => {
  //create new JSON object representing post and populate it with data from request
  const newPost = {
    body: req.body.body,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    commentCount: 0,
  };

  if (req.body.body.trim() === "")
    return res.status(400).json({ post: "Must not be empty" });

  db.collection("posts")
    .add(newPost)
    .then((responsePostDoc) => {
      const resPost = newPost;
      resPost.postId = responsePostDoc.id;
      res.json({ resPost });
    })
    .catch((err) => {
      res.status(500).json({ error: "Error creating post" });
    });
};

/*--------------------------------Delete post endpoint------------------------------------- */
exports.deletePost = (req, res) => {
  const postDoc = db.doc(`/posts/${req.params.postId}`);
  postDoc
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      if (doc.data().userHandle !== req.user.handle) {
        return res.status(403).json({ error: "Unauthorized" });
      } else {
        return postDoc.delete();
      }
    })
    .then(() => {
      res.json({ message: "Post deleted succesfully" });
    })
    .catch((err) => {
      console.error(err);
      return res.status(500).json({ error: err });
    });
};

/*--------------------------------Get post endpoint------------------------------------- */
exports.getPost = (req, res) => {
  let postData = {};
  db.doc(`/posts/${req.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      postData = doc.data();
      postData.postId = doc.id;
      return db
        .collection("comments")
        .orderBy("createdAt", "desc")
        .where("postId", "==", req.params.postId)
        .get();
    })
    .then((data) => {
      postData.comments = [];
      data.forEach((comment) => {
        postData.comments.push(comment.data());
      });
      return res.json(postData);
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

/*--------------------------------Comment on post endpoint------------------------------------- */
exports.commentOnPost = (req, res) => {
  if (req.body.body.trim() === "")
    return res.status(400).json({ comment: "Must not be empty" });

  const newComment = {
    body: req.body.body,
    createdAt: new Date().toISOString(),
    postId: req.params.postId,
    userHandle: req.user.handle,
    userImage: req.user.imageUrl,
  };

  db.doc(`/posts/${req.params.postId}`)
    .get()
    .then((doc) => {
      if (!doc.exists) {
        return res.status(404).json({ error: "Post not found" });
      }
      return doc.ref.update({ commentCount: doc.data().commentCount + 1 });
    })
    .then(() => {
      db.collection(`comments`).add(newComment);
    })
    .then(() => {
      res.json(newComment);
    })

    .catch((err) => {
      console.log(err);
      res.status(500).json({ error: err.code });
    });
};

/*--------------------------------Like post endpoint------------------------------------- */
exports.likePost = (req, res) => {
  const likeDoc = db
    .collection("likes")
    .where("userHandle", "==", req.user.handle)
    .where("postId", "==", req.params.postId)
    .limit(1);

  const postDoc = db.doc(`/posts/${req.params.postId}`);
  let postData;

  postDoc
    .get()
    .then((doc) => {
      if (doc.exists) {
        postData = doc.data();
        postData.postId = doc.id;
        return likeDoc.get();
      } else {
        return res.status(404).json({ error: "Post not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return db
          .collection("likes")
          .add({
            postId: req.params.postId,
            userHandle: req.user.handle,
          })
          .then(() => {
            postData.likeCount++;
            return postDoc.update({ likeCount: postData.likeCount });
          })
          .then(() => {
            return res.json(postData);
          });
      } else {
        return res
          .status(400)
          .json({ error: `Post already liked by ${req.user.handle}` });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};

/*--------------------------------Unlike post endpoint------------------------------------- */
exports.unlikePost = (req, res) => {
  const likeDoc = db
    .collection("likes")
    .where("userHandle", "==", req.user.handle)
    .where("postId", "==", req.params.postId)
    .limit(1);

  const postDoc = db.doc(`/posts/${req.params.postId}`);
  let postData;

  postDoc
    .get()
    .then((doc) => {
      if (doc.exists) {
        postData = doc.data();
        postData.postId = doc.id;
        return likeDoc.get();
      } else {
        return res.status(404).json({ error: "Post not found" });
      }
    })
    .then((data) => {
      if (data.empty) {
        return res.status(400).json({ error: "Post not liked" });
      } else {
        return db
          .doc(`/likes/${data.docs[0].id}`)
          .delete()
          .then(() => {
            postData.likeCount--;
            return postDoc.update({ likeCount: postData.likeCount });
          })
          .then(() => {
            res.json(postData);
          });
      }
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ error: err.code });
    });
};
