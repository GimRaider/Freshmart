const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const {
    query,
    initializeDatabase
} = require("./database/database");


const app = express();

const PORT = process.env.PORT || 3000;

const JWT_SECRET =
    process.env.JWT_SECRET;


if (!JWT_SECRET) {

    console.error(
        "JWT_SECRET environment variable is missing."
    );

    process.exit(1);

}


/* =========================
   MIDDLEWARE
========================= */

app.use(cors());

app.use(express.json());

app.use(express.static("public"));


/* =========================
   AUTHENTICATION
========================= */

function authenticate(req, res, next) {

    const header =
        req.headers.authorization;


    if (!header) {

        return res.status(401).json({
            message: "Login required."
        });

    }


    const token =
        header.replace("Bearer ", "");


    try {

        req.user =
            jwt.verify(
                token,
                JWT_SECRET
            );

        next();

    } catch {

        res.status(401).json({
            message:
                "Invalid or expired login."
        });

    }

}


/* =========================
   REGISTER
========================= */

app.post("/api/register", async (req, res) => {

    try {

        const {
            name,
            email,
            password,
            phone,
            address
        } = req.body;


        if (!name || !email || !password) {

            return res.status(400).json({
                message:
                    "Name, email and password are required."
            });

        }


        const existing =
            await query(
                `
                SELECT id
                FROM customers
                WHERE email = $1
                `,
                [email.toLowerCase()]
            );


        if (existing.rows.length) {

            return res.status(409).json({
                message:
                    "An account already exists."
            });

        }


        const hashed =
            await bcrypt.hash(
                password,
                12
            );


        const result =
            await query(
                `
                INSERT INTO customers
                (
                    name,
                    email,
                    password,
                    phone,
                    address
                )

                VALUES ($1,$2,$3,$4,$5)

                RETURNING id
                `,
                [
                    name,
                    email.toLowerCase(),
                    hashed,
                    phone || "",
                    address || ""
                ]
            );


        res.status(201).json({

            message:
                "Account created successfully.",

            customerId:
                result.rows[0].id

        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            message:
                "Registration failed."
        });

    }

});


/* =========================
   LOGIN
========================= */

app.post("/api/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;


        const result =
            await query(
                `
                SELECT *
                FROM customers
                WHERE email = $1
                `,
                [email.toLowerCase()]
            );


        if (!result.rows.length) {

            return res.status(401).json({
                message:
                    "Invalid email or password."
            });

        }


        const customer =
            result.rows[0];


        const valid =
            await bcrypt.compare(
                password,
                customer.password
            );


        if (!valid) {

            return res.status(401).json({
                message:
                    "Invalid email or password."
            });

        }


        const token =
            jwt.sign(
                {
                    id: customer.id,
                    email: customer.email
                },

                JWT_SECRET,

                {
                    expiresIn: "7d"
                }
            );


        res.json({

            token,

            customer: {

                id: customer.id,

                name: customer.name,

                email: customer.email,

                phone: customer.phone,

                address: customer.address

            }

        });


    } catch (error) {

        console.error(error);

        res.status(500).json({
            message:
                "Login failed."
        });

    }

});


/* =========================
   ACCOUNT
========================= */

app.get(
    "/api/account",
    authenticate,
    async (req, res) => {

        try {

            const result =
                await query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        phone,
                        address,
                        created_at

                    FROM customers

                    WHERE id = $1
                    `,
                    [req.user.id]
                );


            if (!result.rows.length) {

                return res.status(404).json({
                    message:
                        "Customer not found."
                });

            }


            res.json(result.rows[0]);


        } catch (error) {

            res.status(500).json({
                message:
                    "Could not load account."
            });

        }

    }
);


/* =========================
   PRODUCTS
========================= */

app.get("/api/products", async (req, res) => {

    try {

        const result =
            await query(`
                SELECT
                    products.*,
                    categories.name AS category

                FROM products

                LEFT JOIN categories

                ON products.category_id =
                   categories.id

                ORDER BY products.id
            `);


        res.json(result.rows);


    } catch (error) {

        res.status(500).json({
            message:
                "Could not load products."
        });

    }

});


/* =========================
   CREATE ORDER
========================= */

app.post(
    "/api/orders",
    authenticate,
    async (req, res) => {

        const client =
            await require("./database/database")
                .query;

        try {

            const {
                items,
                deliveryAddress,
                paymentMethod
            } = req.body;


            if (
                !Array.isArray(items) ||
                items.length === 0
            ) {

                return res.status(400).json({
                    message:
                        "Cart is empty."
                });

            }


            let total = 0;

            const verifiedItems = [];


            for (const item of items) {

                const result =
                    await query(
                        `
                        SELECT *
                        FROM products
                        WHERE id = $1
                        `,
                        [item.productId]
                    );


                if (!result.rows.length) {

                    return res.status(400).json({
                        message:
                            "Product not found."
                    });

                }


                const product =
                    result.rows[0];


                if (
                    product.stock <
                    item.quantity
                ) {

                    return res.status(400).json({

                        message:
                            `${product.name} is out of stock.`

                    });

                }


                total +=
                    Number(product.price) *
                    Number(item.quantity);


                verifiedItems.push({

                    productId:
                        product.id,

                    quantity:
                        Number(item.quantity),

                    price:
                        Number(product.price)

                });

            }


            const order =
                await query(
                    `
                    INSERT INTO orders
                    (
                        customer_id,
                        total,
                        delivery_address,
                        payment_method
                    )

                    VALUES ($1,$2,$3,$4)

                    RETURNING id
                    `,
                    [
                        req.user.id,
                        total,
                        deliveryAddress,
                        paymentMethod
                    ]
                );


            const orderId =
                order.rows[0].id;


            for (const item of verifiedItems) {

                await query(
                    `
                    INSERT INTO order_items
                    (
                        order_id,
                        product_id,
                        quantity,
                        price
                    )

                    VALUES ($1,$2,$3,$4)
                    `,
                    [
                        orderId,
                        item.productId,
                        item.quantity,
                        item.price
                    ]
                );


                await query(
                    `
                    UPDATE products

                    SET stock =
                        stock - $1

                    WHERE id = $2
                    `,
                    [
                        item.quantity,
                        item.productId
                    ]
                );

            }


            await query(
                `
                INSERT INTO order_status_history
                (
                    order_id,
                    status
                )

                VALUES ($1,'Pending')
                `,
                [orderId]
            );


            res.status(201).json({

                message:
                    "Order placed successfully.",

                orderId

            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                message:
                    "Could not create order."
            });

        }

    }
);


/* =========================
   CUSTOMER ORDERS
========================= */

app.get(
    "/api/orders",
    authenticate,
    async (req, res) => {

        try {

            const result =
                await query(
                    `
                    SELECT *

                    FROM orders

                    WHERE customer_id = $1

                    ORDER BY created_at DESC
                    `,
                    [req.user.id]
                );


            res.json(result.rows);


        } catch {

            res.status(500).json({
                message:
                    "Could not load orders."
            });

        }

    }
);


/* =========================
   ORDER DETAILS
========================= */

app.get(
    "/api/orders/:id",
    authenticate,
    async (req, res) => {

        try {

            const order =
                await query(
                    `
                    SELECT *

                    FROM orders

                    WHERE id = $1

                    AND customer_id = $2
                    `,
                    [
                        req.params.id,
                        req.user.id
                    ]
                );


            if (!order.rows.length) {

                return res.status(404).json({
                    message:
                        "Order not found."
                });

            }


            const items =
                await query(
                    `
                    SELECT

                        order_items.*,

                        products.name,

                        products.image

                    FROM order_items

                    JOIN products

                    ON products.id =
                       order_items.product_id

                    WHERE order_id = $1
                    `,
                    [req.params.id]
                );


            const history =
                await query(
                    `
                    SELECT *

                    FROM order_status_history

                    WHERE order_id = $1

                    ORDER BY updated_at
                    `,
                    [req.params.id]
                );


            res.json({

                order:
                    order.rows[0],

                items:
                    items.rows,

                history:
                    history.rows

            });


        } catch {

            res.status(500).json({
                message:
                    "Could not load order."
            });

        }

    }
);


/* =========================
   START
========================= */

initializeDatabase()
    .then(() => {

        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log(
                    `FreshMart running on port ${PORT}`
                );

            }
        );

    })
    .catch(error => {

        console.error(
            "Database initialization failed:",
            error
        );

        process.exit(1);

    });
