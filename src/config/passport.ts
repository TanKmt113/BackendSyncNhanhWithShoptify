import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/User";
import dotenv from "dotenv";

dotenv.config();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = (profile.emails && profile.emails[0]) ? profile.emails[0].value : undefined;
        const googleId = profile.id;
        const displayName = profile.displayName;

        // 1. Check if user exists by Google ID
        let user = await User.findOne({ where: { googleId } });

        if (user) {
          return done(null, user);
        }

        // 2. Check if user exists by Email (to link accounts if needed, or just fail/merge)
        // Here we will treat email matches as the same user and update googleId
        if (email) {
            user = await User.findOne({ where: { email } });
            if (user) {
                user.googleId = googleId;
                await user.save();
                return done(null, user);
            }
        }

        // 3. Create new user
        // Note: Username is required in our model. We'll generate one from the name or email.
        const generatedUsername = email ? email.split("@")[0] : `user_${googleId}`;
        
        // Ensure username uniqueness (simplistic approach)
        let uniqueUsername = generatedUsername;
        let counter = 1;
        while (await User.findOne({ where: { username: uniqueUsername } })) {
            uniqueUsername = `${generatedUsername}${counter}`;
            counter++;
        }

        user = await User.create({
          username: uniqueUsername,
          email: email,
          googleId: googleId,
          password: null, // No password for Google users
        });

        return done(null, user);

      } catch (error) {
        return done(error, undefined);
      }
    }
  )
);

export default passport;
