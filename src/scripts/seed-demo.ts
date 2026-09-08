import { connectDatabase, disconnectDatabase } from "../config/db.js";
import { ShiftModel } from "../modules/shifts/shift.model.js";
import { SignupModel } from "../modules/signups/signup.model.js";
import { signupVolunteer } from "../modules/signups/signup.service.js";
import {
  VolunteerModel,
  type StaffTeam,
} from "../modules/volunteers/volunteer.model.js";

const demoVolunteers: Array<{
  name: string;
  email: string;
  phone: string;
  team: StaffTeam;
  requiredShiftCount: number;
}> = [
  {
    name: "Maya Chen",
    email: "demo.maya@hackillinois.org",
    phone: "217-555-0101",
    team: "SYSTEMS",
    requiredShiftCount: 3,
  },
  {
    name: "Noah Williams",
    email: "demo.noah@hackillinois.org",
    phone: "217-555-0102",
    team: "SYSTEMS",
    requiredShiftCount: 2,
  },
  {
    name: "Priya Patel",
    email: "demo.priya@hackillinois.org",
    phone: "217-555-0103",
    team: "EXPERIENCE",
    requiredShiftCount: 2,
  },
  {
    name: "Elena Garcia",
    email: "demo.elena@hackillinois.org",
    phone: "217-555-0104",
    team: "OUTREACH",
    requiredShiftCount: 1,
  },
  {
    name: "Marcus Johnson",
    email: "demo.marcus@hackillinois.org",
    phone: "217-555-0105",
    team: "DESIGN",
    requiredShiftCount: 2,
  },
  {
    name: "Sam Lee",
    email: "demo.sam@hackillinois.org",
    phone: "217-555-0106",
    team: "EXPERIENCE",
    requiredShiftCount: 0,
  },
];

function futureDate(daysFromNow: number, utcHour: number, minute = 0): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(utcHour, minute, 0, 0);
  return date;
}

const demoShifts = [
  {
    title: "[DEMO] Registration Desk",
    description:
      "Welcome attendees, check registration, and distribute badges.",
    location: "Siebel Center Lobby",
    startAt: futureDate(30, 15),
    endAt: futureDate(30, 17),
    capacity: 3,
    status: "OPEN" as const,
  },
  {
    title: "[DEMO] Sponsor Booth Support",
    description: "Help sponsors set up and direct attendees to their booths.",
    location: "CIF Monumental Study Steps",
    startAt: futureDate(30, 18),
    endAt: futureDate(30, 20),
    capacity: 2,
    status: "OPEN" as const,
  },
  {
    title: "[DEMO] Workshop Room Support",
    description: "Check room capacity and assist the workshop presenter.",
    location: "CIF Room 2035",
    startAt: futureDate(30, 18, 30),
    endAt: futureDate(30, 19, 30),
    capacity: 4,
    status: "OPEN" as const,
  },
  {
    title: "[DEMO] Late Night Snacks",
    description: "Set out snacks and keep the distribution area organized.",
    location: "Siebel Center Atrium",
    startAt: futureDate(30, 21),
    endAt: futureDate(30, 22),
    capacity: 1,
    status: "OPEN" as const,
  },
  {
    title: "[DEMO] Morning Check-in",
    description: "Staff the help desk for the second day of the event.",
    location: "Siebel Center Lobby",
    startAt: futureDate(31, 14),
    endAt: futureDate(31, 16),
    capacity: 3,
    status: "OPEN" as const,
  },
];

async function seedDemo(): Promise<void> {
  await connectDatabase();

  try {
    const volunteers = await Promise.all(
      demoVolunteers.map((volunteer) =>
        VolunteerModel.findOneAndUpdate(
          { email: volunteer.email },
          { $set: volunteer },
          { upsert: true, returnDocument: "after", runValidators: true },
        ),
      ),
    );

    const shifts = await Promise.all(
      demoShifts.map((shift) =>
        ShiftModel.findOneAndUpdate(
          { title: shift.title },
          { $set: { ...shift, confirmedCount: 0 } },
          { upsert: true, returnDocument: "after", runValidators: true },
        ),
      ),
    );

    // Demo shifts are owned by this script. Resetting only their signup rows
    // makes the command repeatable without touching ordinary project data.
    await SignupModel.deleteMany({
      shiftId: { $in: shifts.map((shift) => shift._id) },
    });

    await signupVolunteer(
      shifts[0]._id.toString(),
      volunteers[0]._id.toString(),
    );
    await signupVolunteer(
      shifts[0]._id.toString(),
      volunteers[1]._id.toString(),
    );
    await signupVolunteer(
      shifts[1]._id.toString(),
      volunteers[1]._id.toString(),
    );
    await signupVolunteer(
      shifts[1]._id.toString(),
      volunteers[2]._id.toString(),
    );
    await signupVolunteer(
      shifts[3]._id.toString(),
      volunteers[3]._id.toString(),
    );

    console.log("\nDemo data is ready. Open http://localhost:3000/api-docs\n");
    console.log("Staff IDs:");
    for (const volunteer of volunteers) {
      console.log(`  ${volunteer.name} (${volunteer.team}): ${volunteer._id}`);
    }

    console.log("\nShift IDs:");
    for (const shift of shifts) {
      console.log(`  ${shift.title}: ${shift._id}`);
    }

    console.log("\nSuggested demonstrations:");
    console.log("  1. List OPEN shifts.");
    console.log("  2. List undercommitted SYSTEMS staff.");
    console.log(
      "  3. Try adding Priya to Sponsor Booth Support again (idempotency).",
    );
    console.log(
      "  4. Try adding Noah to Workshop Room Support (time conflict).",
    );
    console.log(
      "  5. Try adding anyone else to Late Night Snacks (capacity limit).",
    );
  } finally {
    await disconnectDatabase();
  }
}

try {
  await seedDemo();
} catch (error: unknown) {
  console.error("Could not seed demo data:", error);
  process.exitCode = 1;
}
