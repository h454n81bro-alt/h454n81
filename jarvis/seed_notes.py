"""Generate a realistic sample markdown vault, so JARVIS has something to think about.

Standard library only. Invoked automatically by build.py when the notes folder is
missing or empty, or directly:  python3 seed_notes.py ./notes
"""

import os
import sys

# Each note starts with a "=== <relative path>" marker line.
VAULT = r"""
=== strategy/business-model-overview.md
# Business Model Overview

Meridian Coffee Roasters is a small specialty roastery in Portland with one cafe and a
growing wholesale arm. We buy green coffee direct from importers, roast three days a
week, and sell through four channels:

1. **Cafe retail** — roughly 55% of revenue, highest margin per cup.
2. **Wholesale beans** — cafes and restaurants buying 5kg bags, see [[Wholesale Expansion Thesis]].
3. **Online subscription** — the [[Subscription Box]], our most predictable revenue.
4. **Farmers market pop-ups** — low volume, high brand value.

The strategic bet is that wholesale and subscription revenue smooth out the seasonality
of cafe traffic, which drops about 20% between June and August. Everything about our
[[Pricing Strategy]] follows from the [[Unit Economics]] of those four channels.

We are deliberately not opening a second cafe in 2026. The capital intensity is high and
the [[Cash Flow Forecast]] shows we would be tight for nine months. The [[2026 Growth Plan]]
puts that money into roasting capacity instead.

Our defensible advantage is roast consistency and relationships with three specific
importers. Neither is glamorous, but both are hard for a new entrant to copy quickly.

=== strategy/2026-growth-plan.md
# 2026 Growth Plan

Three priorities for the year, in order. Anything not on this list is a distraction.

**1. Double wholesale accounts from 11 to 22.** This is the single biggest lever on
revenue and it uses capacity we already have. Owner: Dani. See [[Wholesale Expansion Thesis]]
and [[Local Partnerships]].

**2. Grow the subscription base from 340 to 800.** The [[Subscription Box]] has 4% monthly
churn, which is good, so growth compounds. Main channel is the [[Email Newsletter Strategy]]
plus referral credit through the [[Customer Loyalty Program]].

**3. Add a second roaster.** Our current 15kg machine hits capacity at about 900kg/week.
At 22 wholesale accounts we cross that. Budget is $48,000 installed, funded from operating
cash per the [[Cash Flow Forecast]], not debt.

Explicit non-goals for 2026: no second cafe, no national distribution, no branded
merchandise line beyond what we already sell.

Success looks like $1.4M revenue at 18% net margin, up from $1.05M at 14%. We review
progress at the monthly numbers meeting described in [[Monthly P&L Notes]].

=== strategy/competitor-landscape.md
# Competitor Landscape

Four roasters compete with us meaningfully in Portland.

**Ironbark Coffee** — the big one. Twelve cafes, national wholesale, roasts about 8 tonnes
a week. They win on price and availability. We do not compete with them on wholesale price
and should never try; see [[Pricing Strategy]].

**Salt & Ash** — closest to us in size and quality. Better at social media than we are,
which is what pushed us to write the [[Instagram Content Plan]]. Weaker on consistency;
we have won two accounts from them on that basis alone.

**Fernwood Roasting** — subscription-first, almost no retail. Their box is $4 cheaper
than ours and lower quality. Useful benchmark for the [[Subscription Box]].

**Cafes that roast in-house** — a dozen or so. Not really competitors; several are
wholesale prospects once their roasting hobby stops being fun.

The honest read: we are third or fourth on brand awareness and first or second on cup
quality. The [[Brand Voice Guidelines]] exist to close that awareness gap without
sounding like everyone else.

=== strategy/wholesale-expansion-thesis.md
# Wholesale Expansion Thesis

Wholesale looks less profitable per kilo than retail and it is. Gross margin is 38%
versus 71% in the cafe. We are expanding it anyway, for three reasons.

**Capacity utilisation.** The roaster is a fixed cost that runs three days a week. Every
extra kilo through it absorbs overhead that retail alone has to carry. The [[Unit Economics]]
note has the fixed-cost allocation.

**Revenue predictability.** A wholesale account orders every week, roughly the same amount,
for years. Cafe revenue moves with weather and tourism.

**Distribution as marketing.** Our bags sit on the counter of eleven other businesses.
That is cheaper awareness than any ad we have bought, and it feeds the [[Customer Loyalty Program]].

The constraint is delivery. Above about 20 accounts we need a second van route, which is
a real cost the [[Cash Flow Forecast]] accounts for. It also puts pressure on the
[[Roasting Schedule]] — more accounts means more same-week roast-to-delivery turns.

Target account profile: independent cafe, 5–15kg per week, values consistency over price,
within 20 minutes of the roastery. See [[Local Partnerships]] for the current pipeline.

=== operations/roasting-schedule.md
# Roasting Schedule

We roast Tuesday, Thursday, and Saturday. Everything else in operations bends around
these three days.

**Tuesday** — wholesale roast day. All eleven accounts get roasted Tuesday and delivered
Wednesday morning, resting 18–24 hours. Highest volume day, typically 210kg.

**Thursday** — subscription roast. The [[Subscription Box]] ships Thursday afternoon so
it arrives Friday or Saturday. About 95kg.

**Saturday** — cafe and retail bags, plus any wholesale top-ups. Lightest day, 70kg,
usually done by 1pm.

Rules that are not negotiable: no coffee ships more than 10 days off roast; the roast
log is filled in for every batch, no exceptions; and the machine gets its Friday clean
per the [[Equipment Maintenance Log]].

At 900kg/week we are out of capacity, which is the trigger for the second roaster in the
[[2026 Growth Plan]]. Current run rate is 375kg/week.

Green stock for each roast day is pulled Monday against the [[Inventory Management]] count.
If a lot is short, the substitution ladder is in [[Green Bean Sourcing]].

=== operations/green-bean-sourcing.md
# Green Bean Sourcing

We buy through three importers and hold roughly nine weeks of green stock.

**Cascade Importers** — our main relationship, about 60% of volume. Colombian and
Guatemalan lots. Good pricing, occasionally slow on paperwork.

**Terra Verde** — Ethiopian and Kenyan naturals, 25%. Expensive but they hold the lots we
want for the [[Seasonal Menu Planning]] calendar.

**Blackwood Trading** — spot market, 15%. Used to fill gaps, never for [[Signature Blends]]
components because consistency across lots is unreliable.

Substitution ladder when a lot runs short: same origin different lot, then same flavour
profile different origin, then reformulate the blend and tell wholesale accounts before
they taste the difference themselves. Never silently substitute in a single origin.

Green prices moved up 14% year over year, which is the main pressure on our
[[Pricing Strategy]] and shows up directly in the [[Unit Economics]].

Contracts are signed twice a year, in March and September. We commit to about 70% of
expected volume and buy the rest spot, which keeps flexibility without gambling on price.

=== operations/cafe-opening-checklist.md
# Cafe Opening Checklist

The cafe opens at 6:30am. Opening barista arrives 5:45am.

**5:45** — lights, music at level 3, unlock back door only.
**5:50** — espresso machine on, group heads flushed, steam wands purged.
**6:00** — grinder calibration. Pull a shot, weigh in and out, adjust to 18g in / 36g out
in 27–30 seconds. Record on the dial-in sheet. This is the single most common cause of a
bad morning; see [[Barista Training Program]].
**6:10** — brew batch filter, fill the airpot, label with the coffee name and time.
**6:15** — pastry case stocked, prices checked against the current menu.
**6:20** — float counted, till opened, card reader tested with a $0.01 transaction.
**6:25** — sweep the front, wipe the bar, put the sandwich board out.

Closing is the reverse plus the backflush and the cash drop described in the
[[Team Handbook]]. Any equipment fault goes in the [[Equipment Maintenance Log]] the same
day, not "when there's time".

=== operations/equipment-maintenance-log.md
# Equipment Maintenance Log

Equipment failure is the most expensive kind of surprise we have. A dead espresso machine
costs about $1,200 in lost revenue per day.

**Daily** — backflush the espresso machine with water at close, Wednesday and Sunday with
detergent. Purge and wipe steam wands after every drink. Empty the knock box.

**Weekly** — Friday roaster clean: chaff collector emptied, cooling tray vacuumed, drum
inspected. Grinder burrs brushed out Sunday night.

**Monthly** — descale check on the espresso boiler, water filter pressure reading logged.
Roaster belt tension checked.

**Quarterly** — professional service on the roaster ($420), grinder burrs measured for
wear and replaced at 1,200kg. Budget for this sits in [[Monthly P&L Notes]] as a recurring
line, not a surprise.

Every fault gets logged with date, symptom, and what was done. Three of our last four
breakdowns had a warning sign in this log that nobody read. The Friday clean is part of
the [[Roasting Schedule]] for exactly this reason.

=== operations/inventory-management.md
# Inventory Management

We count three things weekly and one thing daily.

**Weekly, Monday morning:** green coffee by lot, retail bags by SKU, and cafe consumables
(cups, lids, milk, syrups). The green count drives the week's [[Roasting Schedule]] and
any reorder against [[Green Bean Sourcing]].

**Daily:** roasted coffee on hand, because it ages. Anything past 21 days off roast goes
to staff or cold brew, never to a customer or a wholesale account.

Target green stock is nine weeks. Below six weeks we are exposed to shipping delays;
above twelve we are tying up cash the [[Cash Flow Forecast]] would rather deploy elsewhere.

Retail bag par levels: 12 bags per SKU in the cafe, 30 in the back. Subscription
allocations are held separately and never raided for cafe stock, which we learned the
hard way in March.

Shrinkage runs about 1.8% of green weight through roast loss variance and spillage.
Anything above 3% means a scale is wrong or a process is being skipped.

=== marketing/brand-voice-guidelines.md
# Brand Voice Guidelines

We sound like a knowledgeable friend, not a sommelier and not a startup.

**Do:** short sentences. Concrete detail over adjectives — "roasted Tuesday, 1,750m,
washed" beats "exceptional and complex". Admit when a coffee is not for everyone. Use
the farmer's or co-op's name whenever we have it.

**Don't:** "artisanal", "curated", "journey", "elevate". No exclamation marks in body
copy. Never describe a coffee as "smooth" — it means nothing.

**On price:** we are more expensive than the supermarket and we say why, plainly. Green
cost, roast frequency, and volume. The reasoning lives in [[Pricing Strategy]]; the public
version is one sentence, not a lecture.

This voice applies everywhere — the [[Instagram Content Plan]], the
[[Email Newsletter Strategy]], bag labels, and the way baristas answer questions at the
bar per the [[Barista Training Program]].

The point of this note is differentiation. Per the [[Competitor Landscape]], every roaster
in town writes the same copy. Sounding like a person is the cheapest edge available.

=== marketing/instagram-content-plan.md
# Instagram Content Plan

Four posts a week, on a rotation. Instagram is our top-of-funnel; the
[[Email Newsletter Strategy]] does the converting.

**Monday — process.** Roasting, cupping, a green delivery being unloaded. These perform
worst on likes and best on saves, which is what actually matters.
**Wednesday — people.** A barista, a farmer, a wholesale partner from [[Local Partnerships]].
Highest engagement by a wide margin.
**Friday — product.** New release, [[Seasonal Menu Planning]] item, or a [[Signature Blends]]
restock. Always with a link in bio.
**Sunday — cafe atmosphere.** Low effort, keeps the grid warm.

Captions follow the [[Brand Voice Guidelines]]: two or three sentences, one concrete fact,
no hashtag walls. Five hashtags maximum, all local.

We do not buy followers, run giveaways, or post reels of latte art set to trending audio.
Salt & Ash does all three and it has not moved their wholesale numbers.

Measurement: saves and profile-to-website clicks, reviewed monthly. Follower count is a
vanity number we deliberately ignore.

=== marketing/email-newsletter-strategy.md
# Email Newsletter Strategy

The list is 2,900 people and it is the most valuable marketing asset we own, because we
are not renting the audience from a platform.

**Cadence:** every second Tuesday. One send, no drip sequences, no re-sends to non-openers.
Open rate holds around 41%, click rate 6.2%.

**Structure:** one short story from the week, one coffee we want to sell, one link. That
is the whole template. It follows the [[Brand Voice Guidelines]] and takes 40 minutes to write.

**What works:** stories about specific lots and the people who grew them, and honest notes
about what went wrong. The "we scorched 12kg of Ethiopian and here's what we learned" email
was our highest-clicking send of all time.

**What doesn't:** discount codes. They spike one send and depress the next three, and they
undercut [[Pricing Strategy]].

This is the primary acquisition channel for the [[Subscription Box]] and therefore for
priority two of the [[2026 Growth Plan]]. Signup happens at the till, on the site, and in
every [[Instagram Content Plan]] link-in-bio.

=== marketing/local-partnerships.md
# Local Partnerships

Partnerships are how wholesale actually grows. Cold outreach converts at about 4%;
an introduction converts at 40%.

**Current wholesale accounts (11):** Ardent Bakery, Pinewood Kitchen, The Reading Room,
Foldwell Books, Harbour Gym Cafe, Studio 9, Marlowe's, Two Rivers Hotel, Grainhouse,
Northside Dental (office coffee), Verity Yoga.

**Pipeline for the [[2026 Growth Plan]]:** four bakeries, two hotels, a co-working space,
and the university's staff cafe. The hotels are the biggest volume and the slowest
procurement.

**Non-wholesale partnerships that still pay:** the bookshop does a coffee-and-book bundle
each December; the gym takes our bags as a member perk; the yoga studio hosts a cupping
twice a year that reliably adds 20–30 people to the [[Email Newsletter Strategy]] list.

What we offer partners: free equipment loan above 8kg/week, staff training from the
[[Barista Training Program]], and their name on our bag. What we ask: the bag stays visible
and they tell us before they switch.

Every account is a marketing surface, which is half the argument in the
[[Wholesale Expansion Thesis]].

=== marketing/customer-loyalty-program.md
# Customer Loyalty Program

Simple by design: buy ten drinks, get one free, tracked in the till app rather than a
paper card.

Redemption sits at 62%, which is high and deliberately so — a loyalty scheme nobody
redeems is just a tax on trust. Average member visits 2.4 times a week versus 1.1 for
non-members.

**Referral credit:** members who refer a [[Subscription Box]] signup get a $10 credit and
the new subscriber gets their first bag at half price. This is the cheapest subscriber
acquisition we have, well under the paid equivalent, and it is a named lever in the
[[2026 Growth Plan]].

**Bag stamp:** every retail bag has a code worth one drink. It moves people from the
online store into the cafe, where the [[Unit Economics]] are better.

We do not do tiers, points that expire, or an app. Three separate customers have told us
the lack of an app is why they use it. That fits the [[Brand Voice Guidelines]] — the
scheme should feel like a favour, not a scheme.

=== finance/unit-economics.md
# Unit Economics

Per kilo of roasted coffee, averaged across origins, at current green prices.

**Green cost** $9.80/kg landed. Roast loss 16%, so a kilo of roasted coffee starts from
$11.67 of green. Green prices are up 14% this year per [[Green Bean Sourcing]].

**Direct cost per roasted kg:** green $11.67, packaging $1.40, labour $2.10, gas and
power $0.55. Total $15.72.

**Channel margins:**
- Cafe: a kilo makes about 65 drinks at an average $4.60 = $299 revenue. After milk, cups
  and cafe labour, contribution is roughly 71%.
- Wholesale: sells at $25.50/kg. Gross margin 38%, before the delivery cost that the
  [[Wholesale Expansion Thesis]] flags as the real constraint.
- Subscription: $19 per 250g bag = $76/kg equivalent, minus $6.20 shipping and packaging
  per box. Effective margin 54%, and it is prepaid, which the [[Cash Flow Forecast]] loves.

Fixed overhead is $31,400/month. Breakeven is about 310kg/week; we run 375kg, which is
uncomfortably close and the main argument in the [[2026 Growth Plan]].

=== finance/monthly-pl-notes.md
# Monthly P&L Notes

We close the books on the 5th and hold a 45-minute numbers meeting on the 7th. Dani, Marco,
and the bookkeeper attend.

**The four numbers we actually look at:**
1. Revenue by channel, against the [[Business Model Overview]] mix targets.
2. Gross margin by channel, against the [[Unit Economics]] model. A 3-point drift is a
   conversation; 5 points is a problem.
3. Labour as a percentage of revenue. Target 32%, alarm at 36%.
4. Weeks of green stock on hand, from [[Inventory Management]].

**Recurring lines people forget to budget:** quarterly roaster service $420, card
processing at 2.6%, and the seasonal casual hours in December from the [[Hiring Playbook]].

Last quarter's story: revenue up 9%, gross margin down 2.4 points, entirely explained by
green cost increases we have not yet passed through. That decision belongs to
[[Pricing Strategy]] and we have deferred it twice.

Cash position and runway are tracked separately in the [[Cash Flow Forecast]], because
profit and cash are not the same thing and confusing them nearly killed us in year two.

=== finance/pricing-strategy.md
# Pricing Strategy

Three rules.

**1. We never compete with Ironbark on wholesale price.** They roast eight times our
volume and their cost base is structurally lower. We compete on consistency, freshness,
and the relationship. See [[Competitor Landscape]].

**2. Price increases are annual, announced, and explained.** One increase a year, in
February, with 30 days notice to wholesale accounts and a plain-English note to retail
customers per the [[Brand Voice Guidelines]]. Salami-slicing prices quarterly destroys trust
for the same revenue.

**3. Green cost pass-through is partial and lagged.** When green goes up 14%, we pass
through about 8% and absorb the rest. Absorbing all of it is how you end up with the
margin compression in [[Monthly P&L Notes]].

**Current prices:** retail 250g $19, wholesale $25.50/kg, cafe espresso $3.80, filter $4.60,
[[Subscription Box]] $19 per bag with free shipping over two bags.

Deliberate choices: no discount codes (they train customers to wait), no loyalty discount
beyond the free drink in the [[Customer Loyalty Program]], and no price difference between
origins even when green cost differs, because explaining it at the bar costs more than it
earns.

=== finance/cash-flow-forecast.md
# Cash Flow Forecast

Thirteen-week rolling forecast, updated every Monday. This is the number that keeps the
business alive; profit is the number that makes it worth running.

**Structure:** opening cash, plus receipts by channel, minus green coffee payments, payroll,
rent, and everything else. Green contracts land in lumps of $18,000–$25,000 twice a year
per [[Green Bean Sourcing]], and those two weeks are always the tightest.

**Current position:** $61,000 cash, about 9 weeks of operating expense. Target is 12 weeks.

**Why the [[Subscription Box]] matters disproportionately:** it is prepaid. 340 subscribers
paying monthly is roughly $23,000 of cash arriving before we spend anything on it. Growing
it to 800 per the [[2026 Growth Plan]] is as much a cash strategy as a revenue one.

**The second roaster** at $48,000 is funded from operating cash across two quarters, not
debt. That decision means no second cafe this year, which is stated plainly in the
[[Business Model Overview]].

Seasonality: June through August cafe revenue drops about 20%. We plan for it rather than
being surprised by it every single year.

=== people/hiring-playbook.md
# Hiring Playbook

We hire slowly and we hire for temperament.

**What we screen for, in order:** reliability, curiosity, and warmth with strangers. Coffee
skill is the easiest of the four to teach and the [[Barista Training Program]] teaches it in
six weeks.

**Process:** a 20-minute phone call, then a paid four-hour trial shift on a real Saturday.
The trial is the whole decision. We watch whether they clean without being asked, how they
handle being behind, and whether they ask questions.

**Questions that work:** "Tell me about a shift that went badly." "What did you last learn
outside work?" Questions that do not: anything about a five-year plan.

**Seasonal hires:** two casuals for December, recruited in October. Their cost is a
recurring line in [[Monthly P&L Notes]] that we have forgotten to budget twice.

**Onboarding day one:** the [[Team Handbook]], the [[Cafe Opening Checklist]], and a shift
shadowing the most senior barista on. Nobody works a bar alone in their first two weeks.

Current team: 6 full-time, 4 part-time. Turnover is 1 person a year, which is far below
the industry norm and is worth more than any recruiting cleverness.

=== people/barista-training-program.md
# Barista Training Program

Six weeks, structured, with a sign-off at each stage. Nobody serves a drink unsupervised
in week one.

**Week 1 — the bar.** Machine anatomy, grinder calibration, the dial-in routine from the
[[Cafe Opening Checklist]]. Tasting espresso every day, correct and deliberately wrong.
**Week 2 — extraction.** Ratio, time, yield. Why a shot channels. Weighing everything.
**Week 3 — milk.** Texture before art. Sign-off is a flat white a customer would pay for,
not a rosetta.
**Week 4 — speed under load.** Working a real rush with a second person on bar.
**Week 5 — the customer.** Answering "what's this one like?" in one sentence per the
[[Brand Voice Guidelines]]. Handling a remake without apology theatre.
**Week 6 — brew and close.** Batch filter, pour-over, and the full closing routine from the
[[Team Handbook]].

Ongoing: Friday staff cupping, 20 minutes, everyone tastes what we are selling next week
from [[Seasonal Menu Planning]].

We also run a condensed two-day version for wholesale accounts, which is one of the offers
listed in [[Local Partnerships]] and a genuine reason accounts stay with us.

=== people/team-handbook.md
# Team Handbook

The short version of how we work.

**Shifts:** rosters published 14 days ahead. Swaps are fine if both people agree and it is
in the group chat before the shift. Two no-shows without contact and we have a conversation.

**Pay:** above award, reviewed every February with the [[Pricing Strategy]] increase. Tips
are pooled and split by hours, including the roasting team.

**Closing cash:** counted twice, dropped in the safe, logged. Never left in the till.

**Free coffee:** unlimited on shift, one bag a fortnight off shift, staff price for friends
is honesty-based and nobody has abused it in four years.

**If something breaks:** log it in the [[Equipment Maintenance Log]] the same day and tell
Marco. There is no scenario where hiding a fault is better.

**If you make a mistake with a customer:** fix it immediately, no charge, no lecture, and
tell someone. We would rather lose $4.60 than a regular.

**Weekly rhythm:** the standup format in [[Weekly Standup Format]] on Monday, staff cupping
Friday from the [[Barista Training Program]]. Opening duties are in the
[[Cafe Opening Checklist]].

=== people/weekly-standup-format.md
# Weekly Standup Format

Monday, 9:15am, 15 minutes, standing up, in the roastery. Everyone on shift attends.

**The four things, in order:**
1. **Numbers** — last week's revenue and the green stock count from [[Inventory Management]].
   Thirty seconds, no discussion.
2. **This week's coffees** — what is roasting when, per the [[Roasting Schedule]], and what
   is new from [[Seasonal Menu Planning]] so the bar can answer questions.
3. **Blockers** — anything broken, anyone short-staffed, any account unhappy.
4. **One improvement** — a single small thing we will change this week. One, not five.

What it is not: a status report to management, a place for long decisions, or somewhere to
raise a personal issue. Those get a separate conversation, which is in the [[Team Handbook]].

The monthly version of this with actual depth is the numbers meeting in
[[Monthly P&L Notes]].

Keeping it to 15 minutes is the whole discipline. When it runs to 30 people stop bringing
real blockers, and the blockers are the point.

=== product/signature-blends.md
# Signature Blends

Three blends, unchanged in structure for four years. Consistency is the product.

**Meridian House** — 60% Colombian washed, 30% Brazilian natural, 10% Guatemalan. Chocolate,
almond, low acidity. This is 70% of wholesale volume and the reason accounts stay. It must
taste the same in March and November, which is what the substitution ladder in
[[Green Bean Sourcing]] protects.

**Northbound** — 50% Ethiopian washed, 50% Colombian. Brighter, floral, for filter. Sells
well in the cafe and terribly in wholesale, where it confuses customers expecting one taste.

**Slow Burn** — dark, 100% Brazilian, for the two accounts who want a traditional espresso
and for cold brew. We do not push it, but dropping it would cost us those accounts.

Blend components are never sourced from [[Green Bean Sourcing]]'s spot supplier, because
lot-to-lot variance in a blend is invisible until it is a complaint.

Single origins rotate seasonally per [[Seasonal Menu Planning]]. Blends do not rotate. That
distinction is most of our quality reputation in the [[Competitor Landscape]].

=== product/seasonal-menu-planning.md
# Seasonal Menu Planning

Single origins rotate four times a year, following harvest and shipping, not the calendar.

**Feb–Apr** — Colombian and Guatemalan arrivals. The strongest window for filter.
**May–Jul** — Ethiopian and Kenyan. The most interesting coffees we sell and the hardest
to explain at the bar, hence the week-five module of the [[Barista Training Program]].
**Aug–Oct** — Brazilian new crop, plus whatever Terra Verde has held for us per
[[Green Bean Sourcing]].
**Nov–Jan** — festive-leaning, heavier profiles, plus the December bundle with the bookshop
from [[Local Partnerships]].

Each rotation needs: a cupping four weeks out, bag artwork two weeks out, tasting notes
written to the [[Brand Voice Guidelines]], a staff cupping before launch, and a slot in the
[[Instagram Content Plan]] Friday post.

Rotations never touch the [[Signature Blends]]. Wholesale accounts get told about a rotation
two weeks ahead so they can update their own menus — a small courtesy that has won us two
accounts from Salt & Ash.

The [[Subscription Box]] follows this calendar exactly; that is most of its appeal.

=== product/subscription-box.md
# Subscription Box

340 active subscribers, $19 per 250g bag, most on two bags monthly. Roasted Thursday per
the [[Roasting Schedule]] and shipped the same afternoon.

**Why it matters more than its revenue share:** it is prepaid, which the
[[Cash Flow Forecast]] depends on, and churn is 4% monthly, so growth compounds. Priority
two of the [[2026 Growth Plan]] is taking it to 800 subscribers.

**What subscribers actually get:** the current single origin from [[Seasonal Menu Planning]],
or a standing choice of [[Signature Blends]] if they prefer consistency. About 60% choose
the rotation.

**Acquisition:** the [[Email Newsletter Strategy]] is the main channel, then referral credit
from the [[Customer Loyalty Program]], then the code on every retail bag.

**Why people cancel:** in exit surveys, "too much coffee" beats price four to one. We fixed
part of this by allowing a skip-a-month button, and churn fell from 6.1% to 4%.

Margin is 54% per [[Unit Economics]], between wholesale and cafe, with the best cash profile
of the three.
"""


def parse(vault_text):
    notes, path, buf = [], None, []
    for line in vault_text.splitlines():
        if line.startswith("=== "):
            if path:
                notes.append((path, "\n".join(buf).strip() + "\n"))
            path, buf = line[4:].strip(), []
        elif path:
            buf.append(line)
    if path:
        notes.append((path, "\n".join(buf).strip() + "\n"))
    return notes


def seed(target_dir):
    """Write the sample vault into target_dir. Returns the number of notes written."""
    written = 0
    for rel, body in parse(VAULT):
        dest = os.path.join(target_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write(body)
        written += 1
    return written


if __name__ == "__main__":
    where = sys.argv[1] if len(sys.argv) > 1 else "./notes"
    count = seed(where)
    print("Wrote %d sample notes into %s" % (count, os.path.abspath(where)))
