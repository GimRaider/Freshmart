const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
});

async function query(text, params) {
    return pool.query(text, params);
}

async function initializeDatabase() {

    await query(`
        CREATE TABLE IF NOT EXISTS customers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(150) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone VARCHAR(30),
            address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);


    await query(`
        CREATE TABLE IF NOT EXISTS categories (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) UNIQUE NOT NULL
        );
    `);


    await query(`
        CREATE TABLE IF NOT EXISTS products (
            id SERIAL PRIMARY KEY,
            name VARCHAR(200) NOT NULL,
            description TEXT,
            price NUMERIC(10,2) NOT NULL,
            stock INTEGER DEFAULT 0,
            image TEXT,
            category_id INTEGER
                REFERENCES categories(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);


    await query(`
        CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,

            customer_id INTEGER NOT NULL
                REFERENCES customers(id),

            total NUMERIC(10,2) NOT NULL,

            status VARCHAR(50)
                DEFAULT 'Pending',

            delivery_address TEXT NOT NULL,

            payment_method VARCHAR(50) NOT NULL,

            payment_status VARCHAR(50)
                DEFAULT 'Pending',

            created_at TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );
    `);


    await query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id SERIAL PRIMARY KEY,

            order_id INTEGER NOT NULL
                REFERENCES orders(id)
                ON DELETE CASCADE,

            product_id INTEGER NOT NULL
                REFERENCES products(id),

            quantity INTEGER NOT NULL,

            price NUMERIC(10,2) NOT NULL
        );
    `);


    await query(`
        CREATE TABLE IF NOT EXISTS order_status_history (
            id SERIAL PRIMARY KEY,

            order_id INTEGER NOT NULL
                REFERENCES orders(id)
                ON DELETE CASCADE,

            status VARCHAR(50) NOT NULL,

            updated_at TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );
    `);


    const categories = [
        "Fruits",
        "Vegetables",
        "Dairy",
        "Bakery",
        "Drinks",
        "Meat",
        "Frozen",
        "Snacks",
        "Household"
    ];


    for (const category of categories) {

        await query(
            `
            INSERT INTO categories (name)
            VALUES ($1)
            ON CONFLICT (name)
            DO NOTHING
            `,
            [category]
        );

    }


    console.log("Database initialized.");

}


module.exports = {
    query,
    initializeDatabase
};
