"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../src/config/database"));
async function checkSchema() {
    try {
        await database_1.default.authenticate();
        const [results] = await database_1.default.query("DESCRIBE products");
        console.log(JSON.stringify(results, null, 2));
        process.exit(0);
    }
    catch (error) {
        console.error("Error checking schema:", error);
        process.exit(1);
    }
}
checkSchema();
//# sourceMappingURL=check_schema.js.map