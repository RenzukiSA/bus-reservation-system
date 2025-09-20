import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

// El middleware ahora acepta una clave para saber qué validar ('body' o 'query')
export const validate = (key: 'body' | 'query', schema: AnyZodObject) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validamos solo la parte de la petición que nos interesa
      req[key] = await schema.parseAsync(req[key]);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
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
