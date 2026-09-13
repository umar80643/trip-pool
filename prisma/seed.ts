import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeSplits } from "../src/lib/splits";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const [alice, bob, carol] = await Promise.all([
    prisma.user.upsert({
      where: { email: "alice@example.com" },
      update: {},
      create: { name: "Alice", email: "alice@example.com", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "bob@example.com" },
      update: {},
      create: { name: "Bob", email: "bob@example.com", passwordHash },
    }),
    prisma.user.upsert({
      where: { email: "carol@example.com" },
      update: {},
      create: { name: "Carol", email: "carol@example.com", passwordHash },
    }),
  ]);

  const group = await prisma.group.create({
    data: {
      name: "Lisbon Trip",
      currency: "USD",
      // Pre-set so the Explore tab has somewhere to search right after seeding,
      // without needing a live Nominatim geocode call.
      destinationName: "Lisbon, Portugal",
      destinationLat: 38.7223,
      destinationLon: -9.1393,
      startDate: new Date("2026-06-09"),
      endDate: new Date("2026-06-12"),
      members: {
        create: [
          { userId: alice.id, role: "admin" },
          { userId: bob.id, role: "member" },
          { userId: carol.id, role: "member" },
        ],
      },
    },
  });

  // Alice pays for dinner, split equally three ways.
  const dinnerSplits = computeSplits(9000, "equal", [
    { userId: alice.id },
    { userId: bob.id },
    { userId: carol.id },
  ]);
  await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: alice.id,
      amountCents: 9000,
      description: "Dinner at Taverna",
      category: "Food",
      splitType: "equal",
      splits: { create: dinnerSplits },
    },
  });

  // Bob pays for the Airbnb, split by shares (Alice+Carol share a room, Bob has his own).
  const lodgingSplits = computeSplits(30000, "shares", [
    { userId: alice.id, value: 1 },
    { userId: bob.id, value: 2 },
    { userId: carol.id, value: 1 },
  ]);
  await prisma.expense.create({
    data: {
      groupId: group.id,
      paidById: bob.id,
      amountCents: 30000,
      description: "Airbnb (3 nights)",
      category: "Lodging",
      splitType: "shares",
      splits: { create: lodgingSplits },
    },
  });

  await prisma.packingItem.createMany({
    data: [
      { groupId: group.id, name: "Portable charger", quantity: 1, addedById: alice.id }, // shared
      { groupId: group.id, name: "Beach towel", quantity: 3, addedById: bob.id }, // shared
      { groupId: group.id, name: "Passport", assignedToId: alice.id, addedById: alice.id },
      { groupId: group.id, name: "Sunscreen", assignedToId: alice.id, addedById: alice.id, isPacked: true },
    ],
  });

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
        title: "Belém Tower + Jerónimos Monastery",
        createdById: bob.id,
        order: 0,
      },
    ],
  });

  console.log("Seeded demo data:");
  console.log("  alice@example.com / password123 (admin)");
  console.log("  bob@example.com / password123");
  console.log("  carol@example.com / password123");
  console.log(`  Group: ${group.name} (${group.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
