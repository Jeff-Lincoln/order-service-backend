import bcrypt from 'bcrypt';
import { sql } from '../config/database.js';

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: 'USER' | 'ADMIN';
  created_at: Date;
}

export class UserModel {
  static async findByEmail(email: string): Promise<User | null> {
    try {
      const result = await sql`
        SELECT id, email, password_hash, role, created_at 
        FROM users 
        WHERE email = ${email}
      `;
      
      return result.length > 0 ? result[0] as User : null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw new Error('Database error occurred');
    }
  }

  static async findById(id: number): Promise<User | null> {
    try {
      const result = await sql`
        SELECT id, email, password_hash, role, created_at 
        FROM users 
        WHERE id = ${id}
      `;
      
      return result.length > 0 ? result[0] as User : null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw new Error('Database error occurred');
    }
  }

  static async create(email: string, password: string, role: 'USER' | 'ADMIN' = 'USER'): Promise<User> {
    try {
      const saltRounds = 12;
      const password_hash = await bcrypt.hash(password, saltRounds);
      
      const result = await sql`
        INSERT INTO users (email, password_hash, role) 
        VALUES (${email}, ${password_hash}, ${role})
        RETURNING id, email, password_hash, role, created_at
      `;
      
      return result[0] as User;
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      // Handle unique constraint violation
      if (error.code === '23505') {
        throw new Error('User already exists');
      }
      
      throw new Error('Database error occurred');
    }
  }

  static async verifyPassword(user: User, password: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, user.password_hash);
    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  static async updateRole(id: number, role: 'USER' | 'ADMIN'): Promise<User | null> {
    try {
      const result = await sql`
        UPDATE users 
        SET role = ${role}
        WHERE id = ${id}
        RETURNING id, email, password_hash, role, created_at
      `;
      
      return result.length > 0 ? result[0] as User : null;
    } catch (error) {
      console.error('Error updating user role:', error);
      throw new Error('Database error occurred');
    }
  }

  static async deleteUser(id: number): Promise<boolean> {
    try {
      const result = await sql`
        DELETE FROM users 
        WHERE id = ${id}
        RETURNING id
      `;
      
      return result.length > 0;
    } catch (error) {
      console.error('Error deleting user:', error);
      throw new Error('Database error occurred');
    }
  }
}
