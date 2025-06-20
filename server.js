import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pg from "pg";
import passport from "passport";
import session from "express-session";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const { Client } = pg;
const db = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  ssl: {
    rejectUnauthorized: false,
  },
});
db.connect((error) => {
  if (error) {
    console.log(error);
  } else {
    console.log("Connected to the database successfully");
  }
});

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(
  cors({
    origin: "https://advanced-todo-frontend.vercel.app/",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  })
);
app.use(express.static("public"));

/////////////////////////////////////////////////
/////////////////////////////////////////////////

app.use(
  session({
    secret: "I am Abdulwedud",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.set("view engine", "ejs");

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      userProfileURL: process.env.GOOGLE_USER_PROFILE_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Attempt to find user by googleId
        const result = await db.query(
          "SELECT * FROM users WHERE google_id = $1",
          [profile.id]
        );
        if (result.rows.length === 0) {
          console.log(
            "No user found with this Google ID, creating a new user."
          );
          res.redirect("https://advanced-todo-frontend.vercel.app/signIn");
        }

        let user;

        if (result.rows.length > 0) {
          user = result.rows[0]; // Found existing user
        } else {
          // Create new user
          const insertResult = await db.query(
            "INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING *",
            [
              profile.id,
              profile.emails?.[0]?.value || null,
              profile.displayName || null,
            ]
          );
          user = insertResult.rows[0];
        }

        return done(null, user);
      } catch (err) {
        res.redirect("https://advanced-todo-frontend.vercel.app/");
        return done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = result.rows[0];
    done(null, user);
  } catch (err) {
    done(err);
  }
});

/// Middleware to ensure user is authenticated

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    if (!req.user) {
      req.logout();
      return req.accepts("json")
        ? res.status(403).json({ error: "Invalid session" })
        : res.redirect("https://advanced-todo-frontend.vercel.app/signIn");
    }
    return next();
  }

  return req.accepts("json")
    ? res.status(401).json({ error: "Login required" })
    : res.redirect("https://advanced-todo-frontend.vercel.app/signIn");
};

/////////////////////////////////////////////////

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email", "openid"],
    failureRedirect: "/signIn",
    accessType: "offline",
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/signIn" }),
  function (req, res) {
    // Successful authentication, redirect to home page.
    res.redirect("https://advanced-todo-frontend.vercel.app/");
  }
);

app.get("/signOut", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.status(500).send("Could not destroy session");
      }

      res.clearCookie("connect.sid"); // 👈 Clear session cookie explicitly
      res.redirect("https://advanced-todo-frontend.vercel.app/signIn");
    });
  });
});

app.get("/signIn", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("https://advanced-todo-frontend.vercel.app/");
  }
  res.render("https://advanced-todo-frontend.vercel.app/signIn");
});

/////////////////////////////////////////////////
/////////////////////////////////////////////////

app.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM tasks WHERE user_id = $1 AND is_completed = $2",
      [req.user.id, false]
    );

    const tasks = result.rows;
    if (tasks.length === 0) {
      return res.status(404).json({ message: "No tasks found" });
    }
    res.json(tasks);
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.get("/user", ensureAuthenticated, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [
      req.user.id,
    ]);
    const user = result.rows[0];
    res.json(user);
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.post("/add", ensureAuthenticated, (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).send("Title and content are required");
  }
  db.query(
    "INSERT INTO tasks (title,content,user_id) VALUES ($1, $2, $3)",
    [title, content, req.user.id],
    (error, results) => {
      if (error) {
        console.error("Error executing query", error.stack);
        res.status(500).send("Error executing query");
      } else {
        res.status(201).send("Task added successfully");
      }
    }
  );
});

app.get("/completed", ensureAuthenticated, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM tasks WHERE is_completed = $1 AND user_id = $2",
      [true, req.user.id]
    );
    const compTasks = result.rows;
    res.json(compTasks);
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.patch("/done", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).send("ID is required");
  }
  await db.query(
    "UPDATE tasks SET is_completed = $1 WHERE id = $2 AND user_id = $3",
    [true, id, req.user.id],
    (error, results) => {
      if (error) {
        console.error("Error executing query", error.stack);
        res.status(500).send("Error executing query");
      } else {
        res.status(200).send("Task marked as completed");
      }
    }
  );
});

app.delete("/completed/delete", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).send("ID is required");
  }
  await db.query(
    "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
    [id, req.user.id],
    (error, results) => {
      if (error) {
        console.error("Error executing query", error.stack);
        res.status(500).send("Error executing query");
      } else {
        res.status(200).send("Task deleted successfully");
      }
    }
  );
});

//edit the task
app.patch("/edit", async (req, res) => {
  const { id, title, content } = req.body;
  if (!id || !title || !content) {
    return res.status(400).send("ID, title, and content are required");
  }
  try {
    await db.query(
      "UPDATE tasks SET title = $1, content = $2 WHERE id = $3 AND user_id = $4",
      [title, content, id, req.user.id],
      (error, results) => {
        if (results.rows.length === 0) {
          return res.status(404).json({ message: "Task not found" });
        }
        if (error) {
          console.error("Error executing query", error.stack);
          res.status(500).send("Error executing query");
        } else {
          res.status(200).send("Task updated successfully");
        }
      }
    );
  } catch {
    console.error("Error updating task:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/*


*/
