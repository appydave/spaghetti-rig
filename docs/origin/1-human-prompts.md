# Spaghetti Rig: the human prompts

Verbatim. David's own typed turns (dictated) from session `b2aa078a-d4cc-4877-8861-6297cec0a668` (`appyrig-spaghetti`) on the Mac Mini M4, cwd `/Users/davidcruwys/dev/ad/apps/appyrig`. Timestamps are UTC. Paste wrapper tags removed; nothing else changed.

The 2026-10-21 00:50 turn is a prompt David pasted in rather than typed. Its shape matches his `/btw … as prompt:` output, but the transcript only records the paste, not where it came from. The 2026-10-22 rulings that turned the design into the brief are in `1b-rulings-2026-10-22.md`.

---

## 2026-10-20 10:21 UTC · The first idea (during the AppyRig spaghetti run)

`a660de85-a49d-4e53-b9e8-60c32843ee2f`

By the way, when we get to the retroactive, I want us to think: this is just some preliminary information, but I want us to think through how everything has been going in the retro. That's obvious. I want us to think through what we want for videos around this topic, but I also want us to think through how we could visualise it all in a game.

I'm thinking that the Spaghetti Buster game might have been a great visual style and idea, but this time we could do it as a totally different micro application. That looks the same and uses all the same concepts, but this time it talks through getting through all 15 gates, or whatever gates we got.

---

## 2026-10-20 10:25 UTC · The name

`2966791a-cefb-41c5-80bf-0558ba1619ee`

I want the game to be called Spaghetti Rig

---

## 2026-10-21 00:50 UTC · Prompt David pasted in: the new direction

`1bb48dca-68d9-4188-b3d6-f963f437683d`

David has given you a new direction for the "Spaghetti Rig" game. Record it, then interview him about it while appyrig-orch works on the V1 retirement. Don't build anything yet.

**Where it stood before today:** the game was only an entry in `/Users/davidcruwys/dev/appyrigs/runs/spaghetti/appyrig/retro-tier1-agenda.md` §5:
- David chose the name **Spaghetti Rig**;
- the reference is Omer's game at https://spaghetti-busters.vercel.app (source at `/Users/davidcruwys/dev/upstream/repos/spaghetti-busters`);
- the idea was to look like Spaghetti Busters but walk through the gates.

Nothing else was planned. Confirm that by reading the agenda file before you start.

**David's new direction (record it in his words where you can):**
- **Why:** the AppyRig run is having less impact than Omer's did. AppyRig is built from AppyStack, whose template had already handled much of the foundation tier. So David wants a codebase that starts as real spaghetti.
- **The game is built from scratch and vibe-coded,** without the spaghetti rig's rules, following the style and principles of how Omer built his first game.
- **It looks like Spaghetti Busters** (the same guy shooting can stay), but it is **educational and slow-paced, not a fast shooter.** Each shot teaches something. For example, the first shot explains what the foundation tier means, and the next shots cover its parts, the individual gates. The gates are in the game itself.
- **Then the spaghetti rig refactors the game,** gate by gate, the way Omer did with his own game.
- **The run's learnings feed the game's content.** That includes the run sheet artifact (https://claude.ai/artifact/2kYavV6EKgex7xQd1ynCST) and everything that builds up by the end of the run.

**Do now:**
1. Replace §5 of the retro agenda with the direction above, commit and push appyrigs.
2. Interview David in prose, two or three questions at a time, never with AskUserQuestion. Put your recommendation inside each question. Cover:
   - who the game is for: David's audience on video, developers learning static analysis, or both;
   - how much it copies Spaghetti Busters' look and the player character, and the attribution or licence check on Omer's assets and code;
   - the teaching shape: one level per tier and one shot per gate, and where the content comes from (Omer's ladder, our run records);
   - the stack: plain vibe-coded, or on the AppyStack template. Note the tension: AppyStack gives you a clean foundation, which is exactly what made the AppyRig run less dramatic;
   - where it lives (repo name and path) and which machine builds it;
   - when it's built and when the spaghetti rig runs on it, given the queue: AppyStack tier 1 on the M2, then the V1 retirement, then AppyRig tier 2+, and FliStudio is already planned as the second app;
   - how it's filmed: the before/after story for the video.
3. After the interview, write a one-page brief under `/Users/davidcruwys/dev/appyrigs/runs/spaghetti/` (name it to match that folder's convention), commit and push. End your reply to David with one recommendation on the next step.

**Out of scope:**
- writing any game code;
- creating repos;
- launching rigs;
- messaging seats or appyrig-orch;
- changing the RUNBOOK rules.

**Done when:**
- §5 of the agenda is updated and pushed;
- the interview is finished;
- the brief is pushed;
- David has one recommendation for what happens next.

---

## 2026-10-21 01:04 UTC · Interview, round 1

`f9c6b342-83da-4a17-88bb-d69faf579863`

<statement>"both, plain vibe-coded, write it fresh with credit" </statement> Cool. Let's be prepared to move forward with the spec for the game. What is the problem I've got with just writing this statement at the beginning Is that our conversation here has got mixed topics? I do want to answer it the way you think best. I've looked at your interview, round 1 of 3, so I do want to answer that. Do we have other information up above related to some sort of second spec file or something? There are just too many conversations going on in this orchestrator, too quickly for me and you to keep things separated. Let's consolidate into whatever I need to make decisions on.

---

## 2026-10-21 01:09 UTC · Interview answers

`1916ca96-a825-4512-8e19-462b695cf998`

1-3: YES


For 4, you and I have to go into a little bit deeper interview. I've got some ideas in my head. I think you're in the right direction, but I've got to talk about it further.

5. Yes, but built on Roamy. In fact, all the stuff we do with AppyRig to refactor to the game will also be on Roamy. The reason for that is that when I demonstrate the game and demonstrate the AppyRig setups, I'll be doing it from my laptop at an engineers' meetup group.

Keep in mind that M2 is doing spaghetti, M4 is doing spaghetti, and Roamy is doing spaghetti. That also saves us a little bit of energy from the problems that we're aware of: reusing the spaghetti system on one machine is problematic, but using it on multiple machines once is less problematic, just a little bit problematic.

6. I don't think we can. Vibe code the game now. Hopefully, we can vibe code it at the end of the day. We really need to get through all gates on appyrig before we can vibe code the game, because I think the knowledge we learn is part of the game screens.

Don't have an opinion about filming yet. It's too far in the future to worry about that. I don't even think we're going to record the vibe code build. One of the things that Omar did was he just showed us a build, and he showed us Git repos. I think that was cool. The only real demonstration on video was him playing the game, though he didn't do it on video because he did it live.

---

## 2026-10-21 01:31 UTC · The riff: player 1 vs player 2

`a013e682-08ac-4463-adb5-cba6e44a7edf`

So, rather than simple questions like this for the deeper interview Let's riff a little bit. Imagine a game. Imagine Spaghetti Busters as it stands: it's a shooter, a left-to-right sort of shooter. Now, there are other shooters that are one- and/or two-person shooters. I don't know how they go. They could go left to right, with top and bottom: player one top, player two bottom, or they could be left and right, and you could be walking into the scene. I think it's more first-person perspective. I'm not sure. And in my mind, I don't know how to do games, so I'm not even sure whether this is a smart thing to do. But in my mind, the difference between player one and player two is that player one has built a game without gates. He's just vibe-coded it, and what he's looking at as he gets to each gate, each level, is problems. Whereas player two, when he's playing the same game, what he's getting to is tools that overcome In other words, he has the gates, and they're described in such a way that they're a little bit storytelling, but they really do describe: "Oh, this is cyclical complexity, and this is what it looks like, or whatever's going on. Oh, this is unpretty. This is pretty." Then you can do two things: you can play player one, you can play player two, or you can see player one and player two side by side at each gate. And maybe there's just a little bit of shooting out into the distance, and as you shoot, each shot might just show up a little card of information. It must be a bit of knowledge, but we're going to be careful that the idea of a shooter, fast pace, and what we're educating on (one or two items at a time) doesn't really gel that well together. Now, the only reason I looked at first shooter, looking into the future again, could be totally wrong for us is because I wanted to do something side by side (so you could see it's almost like a this versus this). The other game to look at is maybe Tekken, I think it was, or Street Fighter, where this person versus this person. But maybe this is all over ambitious, and we need something simpler in nature. The only thing I'm going to suggest is that we should do the same as Omar: we probably should try to use his style, themes, and colours, and we should try to use his libraries, including three.js. I'm not sure.

---

## 2026-10-21 01:35 UTC · Asking to see the games

`368326a6-8f0c-494e-abef-1e6589dce91f`

I don't know these games. I think you need to have a pop-up with a YouTube video, YouTube short, or simple visualisation of the website that I can look at to see these games I'm not a gamer. That's why I'm saying it.

---

## 2026-10-21 01:43 UTC · Code vs diffs, and asking for a lo-fi demo

`e8af606e-671f-4798-9279-660922ad7dbf`

When we say "show the code," should it be done as a combination of "show the code exactly" or "show git diffs," or both? 

I'm thinking even from the cons. No, I've got an idea, but it's just a question.

I also watched all the videos. I'm still struggling to see how it all is. I'm just wondering about your Spaghetti rig idea at the bottom. I think we need to see it a little bit. How do we do low fidelity, right? This is not about building the game the way we would do it, it's more about demonstrating the game. We would do it in low fidelity as maybe another artefact. What do you think?

---

## 2026-10-21 01:51 UTC · Playing the lo-fi demo

`7a399522-7c88-4b5e-aad8-73e1a8ce5d70`

So far, I've played to step 4 [Image #39] I'm not sure if there are any more. I'd almost like every card that we're going to do to also have one simple unique ID. I understand that we'll have sections like Foundation. We'll have gates like 1, 2, 3, but we should also have just a global thing because I'm going to ask you questions about those. We're going to develop this further. I haven't gone further than where we're at. Maybe there is more. I might do it in a moment, and I'll tell you in this conversation, but I didn't understand the right-hand side of 4, and that'll be... If I don't understand it, I won't be able to teach it. I'll look stupid, and there's something missing. Partly, that could be because of the low fidelity, so let's just keep that in mind. So far, I'm loving the idea of this shooter. Or whatever you call it oh, that was the last one. So cool, thank you. Really cool. I guess what we're trying to do here Is to figure out what all the scenes are going to be and, over time, get that artefact to even a medium level of fidelity, not visually, but just more detail. Almost like we're going to know what the cards are going to have each time
