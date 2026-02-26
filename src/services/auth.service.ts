import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { Op } from "sequelize";

const JWT_SECRET = process.env.JWT_SECRET || "default_secret";
const SALT_ROUNDS = 10;

class AuthService {

    async register(data: any) {
        const { username, password, email } = data;

        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            throw new Error("Username already exists");
        }

        if (email) {
            const existingEmail = await User.findOne({ where: { email } });
            if (existingEmail) {
                throw new Error("Email already exists");
            }
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const user = await User.create({
            username,
            password: hashedPassword,
            email
        });

        return user;
    }

    async login(data: any) {
        const { email, password } = data;

        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { username: email },
                    { email: email }
                ]
            }
        });

        if (!user) {
            throw new Error("User not found 1");
        }

        if (!user.password) {
            throw new Error("Invalid credentials"); // Or specific message: "Please login with Google"
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new Error("Invalid credentials");
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "24h" });

        return { token, user };
    }

    async getMe(userId: number) {
        const user = await User.findByPk(userId, {
            attributes: { exclude: ["password"] }
        });

        if (!user) {
            throw new Error("User not found");
        }

        return user;
    }
}

export default new AuthService();
