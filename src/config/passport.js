const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const avatar =
          profile._json.picture ||
          profile.photos?.[0]?.value ||
          null;

        // Check if user already exists with this Google ID
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });

        if (user) {
          // Update avatar every login in case it changed
          user = await prisma.user.update({
            where: { googleId: profile.id },
            data: { avatar },
          });
          return done(null, user);
        }

        // Check if email already registered with password
        const existingEmail = await prisma.user.findUnique({
          where: { email: profile.emails[0].value },
        });

        if (existingEmail) {
          // Link Google ID and avatar to existing account
          user = await prisma.user.update({
            where: { email: profile.emails[0].value },
            data: { googleId: profile.id, avatar },
          });
          return done(null, user);
        }

        // Brand new user — create account
        user = await prisma.user.create({
          data: {
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            avatar,
            role: "customer",
          },
        });

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await prisma.user.findUnique({ where: { id } });
  done(null, user);
});

module.exports = passport;