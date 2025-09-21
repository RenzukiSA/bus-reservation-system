"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const zod_1 = require("zod");
// El middleware ahora acepta una clave para saber qué validar ('body' o 'query')
const validate = (key, schema) => async (req, res, next) => {
    try {
        // Validamos solo la parte de la petición que nos interesa
        req[key] = await schema.parseAsync(req[key]);
        return next();
    }
    catch (error) {
        if (error instanceof zod_1.ZodError) {
            const formattedErrors = error.errors.map(e => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return res.status(400).json({
                error: 'Datos de entrada inválidos.',
                details: formattedErrors
            });
        }
        return next(error);
    }
};
exports.validate = validate;
