import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeSplits } from "../src/lib/splits";

const prisma = new PrismaClient();

async function main() {
  /*
   * --------------------------------------------------------------------------
   * Demo users
   * --------------------------------------------------------------------------
   */

  const passwordHash = await bcrypt.hash(
    "password123",
    10,
  );

  const [alice, bob, carol] = await Promise.all([
    prisma.user.upsert({
      where: {
        email: "alice@example.com",
      },

      update: {},

      create: {
        name: "Alice",
        email: "alice@example.com",
        passwordHash,
      },
    }),

    prisma.user.upsert({
      where: {
        email: "bob@example.com",
      },

      update: {},

      create: {
        name: "Bob",
        email: "bob@example.com",
        passwordHash,
      },
    }),

    prisma.user.upsert({
      where: {
        email: "carol@example.com",
      },

      update: {},

      create: {
        name: "Carol",
        email: "carol@example.com",
        passwordHash,
      },
    }),
  ]);

  /*
   * --------------------------------------------------------------------------
   * Demo trip
   * --------------------------------------------------------------------------
   */

  const group = await prisma.group.create({
    data: {
      name: "Lisbon Trip",
      currency: "USD",

      /*
       * Demo destination.
       *
       * Explore itself is now dynamic and is NOT seeded here.
       * When the user changes the destination, the application
       * geocodes the new destination and searches dynamically.
       */
      destinationName: "Lisbon, Portugal",
      destinationLat: 38.7223,
      destinationLon: -9.1393,

      startDate: new Date("2026-06-09"),
      endDate: new Date("2026-06-12"),

      members: {
        create: [
          {
            userId: alice.id,
            role: "admin",
          },

          {
            userId: bob.id,
            role: "member",
          },

          {
            userId: carol.id,
            role: "member",
          },
        ],
      },
    },
  });

  /*
   * --------------------------------------------------------------------------
   * Dinner expense
   * --------------------------------------------------------------------------
   *
   * Alice pays for dinner.
   * Split equally between Alice, Bob and Carol.
   */

  const dinnerSplits = computeSplits(
    9000,
    "equal",
    [
      {
        userId: alice.id,
      },

      {
        userId: bob.id,
      },

      {
        userId: carol.id,
      },
    ],
  );

  await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: alice.id,
      amountCents: 9000,
      description: "Dinner at Taverna",
      category: "Food",
      splitType: "equal",

      splits: {
        create: dinnerSplits,
      },
    },
  });

  /*
   * --------------------------------------------------------------------------
   * Lodging expense
   * --------------------------------------------------------------------------
   *
   * Bob pays for the Airbnb.
   *
   * Alice = 1 share
   * Bob   = 2 shares
   * Carol = 1 share
   */

  const lodgingSplits = computeSplits(
    30000,
    "shares",
    [
      {
        userId: alice.id,
        value: 1,
      },

      {
        userId: bob.id,
        value: 2,
      },

      {
        userId: carol.id,
        value: 1,
      },
    ],
  );

  await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: bob.id,
      amountCents: 30000,
      description: "Airbnb (3 nights)",
      category: "Lodging",
      splitType: "shares",

      splits: {
        create: lodgingSplits,
      },
    },
  });

  /*
   * --------------------------------------------------------------------------
   * Packing list
   * --------------------------------------------------------------------------
   */

  await prisma.packingItem.createMany({
    data: [
      {
        groupId: group.id,
        name: "Portable charger",
        quantity: 1,
        addedById: alice.id,
      },

      {
        groupId: group.id,
        name: "Beach towel",
        quantity: 3,
        addedById: bob.id,
      },

      {
        groupId: group.id,
        name: "Passport",
        assignedToId: alice.id,
        addedById: alice.id,
      },

      {
        groupId: group.id,
        name: "Sunscreen",
        assignedToId: alice.id,
        addedById: alice.id,
        isPacked: true,
      },
    ],
  });

  /*
   * --------------------------------------------------------------------------
   * Itinerary
   * --------------------------------------------------------------------------
   */

  await prisma.itineraryItem.createMany({
    data: [
      {
        groupId: group.id,
        date: new Date("2026-06-09"),
        time: "15:00",
        title: "Check in to Airbnb",
        createdById: alice.id,
        order: 0,
      },

      {
        groupId: group.id,
        date: new Date("2026-06-09"),
        time: "19:00",
        title: "Dinner near Alfama",
        notes: "Look for a spot with fado music",
        createdById: alice.id,
        order: 1,
      },

      {
        groupId: group.id,
        date: new Date("2026-06-10"),
        time: "10:00",
        title:
          "Belém Tower + Jerónimos Monastery",
        createdById: bob.id,
        order: 0,
      },
    ],
  });

  /*
   * --------------------------------------------------------------------------
   * Dinner poll
   * --------------------------------------------------------------------------
   */

  const dinnerPoll = await prisma.poll.create({
    data: {
      groupId: group.id,

      question:
        "Where should we eat on the last night?",

      createdById: bob.id,

      options: {
        create: [
          {
            label:
              "Cervejaria Ramiro (seafood)",
            order: 0,
          },

          {
            label: "Time Out Market",
            order: 1,
          },
        ],
      },
    },

    include: {
      options: true,
    },
  });

  /*
   * --------------------------------------------------------------------------
   * Poll votes
   * --------------------------------------------------------------------------
   */

  await prisma.pollVote.createMany({
    data: [
      {
        optionId:
          dinnerPoll.options[0].id,
        userId: alice.id,
      },

      {
        optionId:
          dinnerPoll.options[0].id,
        userId: bob.id,
      },

      {
        optionId:
          dinnerPoll.options[1].id,
        userId: carol.id,
      },
    ],
  });

  /*
   * --------------------------------------------------------------------------
   * Result
   * --------------------------------------------------------------------------
   */

  console.log("");
  console.log("✅ TripPool demo data seeded successfully.");
  console.log("");

  console.log(
    "alice@example.com / password123 (admin)",
  );

  console.log(
    "bob@example.com / password123",
  );

  console.log(
    "carol@example.com / password123",
  );

  console.log("");

  console.log(
    `Group: ${group.name}`,
  );

  console.log(
    `Group ID: ${group.id}`,
  );

  console.log("");

  console.log(
    "Explore places are NOT seeded.",
  );

  console.log(
    "Explore uses dynamic Geoapify search + PostgreSQL cache.",
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
