import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import pkg from "pg";
const { Pool } = pkg;
import passport from "passport";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT),
  ssl: {
    rejectUnauthorized: false,
  },
});

pool
  .connect()
  .then((client) => {
    console.log("Connected to the database successfully");
    client.release();
  })
  .catch((err) => {
    console.error("Database connection error:", err.stack);
  });

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  cors({
    origin: "https://advanced-todo-frontend.vercel.app", // removed trailing slash
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.static("public"));

const pgSession = connectPgSimple(session);

app.use(
  session({
    store: new pgSession({ pool }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      sameSite: "none",
      secure: true,
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
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
        const result = await pool.query(
          "SELECT * FROM users WHERE google_id = $1",
          [profile.id]
        );

        let user;

        if (result.rows.length > 0) {
          user = result.rows[0];
        } else {
          const insertResult = await pool.query(
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
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    const user = result.rows[0];
    done(null, user);
  } catch (err) {
    done(err);
  }
});

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
  (req, res) => {
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

      res.clearCookie("connect.sid");
      res.redirect("https://advanced-todo-frontend.vercel.app/signIn");
    });
  });
});

app.get("/signIn", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("https://advanced-todo-frontend.vercel.app/");
  }
  res.redirect("https://advanced-todo-frontend.vercel.app/signIn");
});

app.get("/", ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
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
  console.log("Session:", req.session);
  console.log("User:", req.user);
  console.log("isAuthenticated:", req.isAuthenticated?.());
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [
      req.user.id,
    ]);
    const user = result.rows[0];
    res.json(user);
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.post("/add", ensureAuthenticated, async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) {
    return res.status(400).send("Title and content are required");
  }
  try {
    await pool.query(
      "INSERT INTO tasks (title, content, user_id) VALUES ($1, $2, $3)",
      [title, content, req.user.id]
    );
    res.status(201).send("Task added successfully");
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.get("/completed", ensureAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tasks WHERE is_completed = $1 AND user_id = $2",
      [true, req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.patch("/done", ensureAuthenticated, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send("ID is required");

  try {
    const result = await pool.query(
      "UPDATE tasks SET is_completed = $1 WHERE id = $2 AND user_id = $3",
      [true, id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).send("Task not found");
    }
    res.status(200).send("Task marked as completed");
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.delete("/completed/delete", ensureAuthenticated, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).send("ID is required");

  try {
    const result = await pool.query(
      "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
      [id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).send("Task not found");
    }
    res.status(200).send("Task deleted successfully");
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).send("Error executing query");
  }
});

app.patch("/edit", ensureAuthenticated, async (req, res) => {
  const { id, title, content } = req.body;
  if (!id || !title || !content) {
    return res.status(400).send("ID, title, and content are required");
  }
  try {
    const result = await pool.query(
      "UPDATE tasks SET title = $1, content = $2 WHERE id = $3 AND user_id = $4",
      [title, content, id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Task not found" });
    }
    res.status(200).send("Task updated successfully");
  } catch (error) {
    console.error("Error executing query", error.stack);
    res.status(500).json({ message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
