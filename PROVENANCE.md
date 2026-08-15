# Provenance

**Status:** unsigned. No constitutional text has been changed.
**Generated:** `npm run provenance` · branch `rebuild/v3` · 24 comparisons

For every provision the three Acts touch: the text in `constitution/current.yaml` today,
the text the Act prescribes, and a verdict. Regenerate with `npm run provenance`.

| Verdict | Meaning | Count |
|---|---|---|
| 🟢 ALREADY-APPLIED | Current text matches the Act's prescribed text | 24 |
| 🟡 NOT-APPLIED | Current text is the pre-Act text, or the insertion has not been made | 0 |
| 🔴 DIVERGENT | Matches neither — edited outside the amendment process | 0 |

## Method

Comparison runs on `src/text-compare.mjs`. Tags are stripped **before** punctuation and
replaced with a space, so inline `<br>` in the specs cannot inject a stray `br` token and
produce a false NOT-APPLIED. `tests/text-compare.test.mjs` asserts this against the real
Article 9 pair; if that fixture fails, no verdict in this file may be trusted.

Enumerator style (`(1)` vs `1.`) and typography (curly vs straight quotes) are folded, so
a provision is not reported as changed merely for being formatted differently.

- **Article scope** — whole-provision similarity, body plus every section heading and body.
- **Clause scope** — containment: whether the Act's clause appears anywhere in the current
  provision. The constitution stores several of these articles as one undivided block, and
  slicing it into clauses would mean guessing where each clause begins.

Match threshold 0.94. Pre-Act baseline is `constitution/versions/v1.0.0.yaml`,
the last version that demonstrably predates all three Acts.

## Summary

| | Act | Provision | Op | Scope | Current title | Act title | Reads as Act | Act words present | Unchanged since v1 | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 🟢 | Act 1 of 2024 | `art-6` (1) | substitute | clause | STM Roles | STM Roles | 100.0% | 100.0% | 73.4% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-6` (2) | substitute | clause | STM Roles | STM Roles | 100.0% | 100.0% | 73.4% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-6` (3) | substitute | clause | STM Roles | STM Roles | 100.0% | 100.0% | 73.4% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-6` (4) | substitute | clause | STM Roles | STM Roles | 100.0% | 100.0% | 73.4% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-6` (5) | substitute | clause | STM Roles | STM Roles | 100.0% | 100.0% | 73.4% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-7` (4) | substitute | clause | Membership | Membership | 100.0% | 100.0% | 76.2% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-7` (6) | substitute | clause | Membership | Membership | 100.0% | 100.0% | 76.2% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-9` | substitute | article | Board Members | Board Members | 100.0% | 100.0% | 28.3% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-10` | substitute | article | Intermediate Board Members | Intermediate Board Members | 100.0% | 100.0% | 32.7% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-11` | substitute | article | Units | Units | 99.4% | 100.0% | 26.8% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-12` | substitute | article | Alumini | Alumni | 100.0% | 100.0% | 47.1% | **ALREADY-APPLIED** |
| 🟢 | Act 1 of 2024 | `art-18` | insert | article | Suspension/Termination | Suspension/Termination | 100.0% | 100.0% | 0.0% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `preamble` | substitute | article | Preamble | Preamble | 100.0% | 100.0% | 30.0% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-3` | substitute | article | Aim and Objectives | Aim and Objectives | 100.0% | 100.0% | 35.0% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-4` | substitute | article | Mission statement | Mission statement | 100.0% | 100.0% | 11.1% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-5` | substitute | article | Vision Statement | Vision Statement | 100.0% | 100.0% | 55.6% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-8` | substitute | article | Internship | Internship | 100.0% | 100.0% | 84.4% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-16` (3) | substitute | clause | Amendments | Amendments | 100.0% | 100.0% | 77.0% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-17` (1) | substitute | clause | Dissolution | Dissolution | 100.0% | 100.0% | 70.5% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-14` | substitute | article | Leaves | Leaves | 100.0% | 100.0% | 12.7% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-20` | insert | article | Meetings and Activities | Meetings and Activities | 100.0% | 100.0% | 0.0% | **ALREADY-APPLIED** |
| 🟢 | Act 2 of 2024 | `art-15` | substitute | article | Exit Process | Exit Process | 100.0% | 100.0% | 9.8% | **ALREADY-APPLIED** |
| 🟢 | Act 3 of 2024 | `art-13` | substitute | article | Annual Report | Annual Report | 100.0% | 100.0% | 70.4% | **ALREADY-APPLIED** |
| 🟢 | Act 3 of 2024 | `art-21` | insert | article | Financial Management | Financial Management | 100.0% | 100.0% | 0.0% | **ALREADY-APPLIED** |

## Provision by provision

### Act 1 of 2024 — *Membership Act, 2024*

#### 🟢 art-6 clause (1) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 18

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 73.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
The membership of the NGO shall be open to all the students of the college who are willing to
serve the society and who are willing to abide by the rules and regulations of the NGO.

Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime.

Intermediate Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime under the board.

Unit Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM in their respective unit within their academic life.

Coordinator
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in the STM in their respective unit within their academic life.

Volunteer
Any person who is willing to serve society and abide by the rules and regulations of the NGO to do service.

Donor
Any person who agrees to donate a certain amount of money to the NGO is eligible to become a donor.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) Board Member: Any person who is willing to serve society and abide by the rules
       and regulations of the NGO to work in STM for lifetime.
```

</details>

#### 🟢 art-6 clause (2) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 18

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 73.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
The membership of the NGO shall be open to all the students of the college who are willing to
serve the society and who are willing to abide by the rules and regulations of the NGO.

Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime.

Intermediate Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime under the board.

Unit Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM in their respective unit within their academic life.

Coordinator
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in the STM in their respective unit within their academic life.

Volunteer
Any person who is willing to serve society and abide by the rules and regulations of the NGO to do service.

Donor
Any person who agrees to donate a certain amount of money to the NGO is eligible to become a donor.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(2) Intermediate Board Member: Any person who is willing to serve society and abide
       by the rules and regulations of the NGO to work in STM for lifetime under the board.
```

</details>

#### 🟢 art-6 clause (3) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 18

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 73.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
The membership of the NGO shall be open to all the students of the college who are willing to
serve the society and who are willing to abide by the rules and regulations of the NGO.

Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime.

Intermediate Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime under the board.

Unit Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM in their respective unit within their academic life.

Coordinator
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in the STM in their respective unit within their academic life.

Volunteer
Any person who is willing to serve society and abide by the rules and regulations of the NGO to do service.

Donor
Any person who agrees to donate a certain amount of money to the NGO is eligible to become a donor.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(3) Unit Board Member: Any person who is willing to serve society and abide by the
       rules and regulations of the NGO to work in STM in their respective unit within their
       academic life.
```

</details>

#### 🟢 art-6 clause (4) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 18

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 73.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
The membership of the NGO shall be open to all the students of the college who are willing to
serve the society and who are willing to abide by the rules and regulations of the NGO.

Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime.

Intermediate Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime under the board.

Unit Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM in their respective unit within their academic life.

Coordinator
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in the STM in their respective unit within their academic life.

Volunteer
Any person who is willing to serve society and abide by the rules and regulations of the NGO to do service.

Donor
Any person who agrees to donate a certain amount of money to the NGO is eligible to become a donor.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(4) Coordinator: Any person who is willing to serve society and abide by the rules and
       regulations of the NGO to work in the STM in their respective unit within their
       academic life.
```

</details>

#### 🟢 art-6 clause (5) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 18

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 73.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
The membership of the NGO shall be open to all the students of the college who are willing to
serve the society and who are willing to abide by the rules and regulations of the NGO.

Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime.

Intermediate Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM for lifetime under the board.

Unit Board Member
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in STM in their respective unit within their academic life.

Coordinator
Any person who is willing to serve society and abide by the rules and regulations of the NGO to work in the STM in their respective unit within their academic life.

Volunteer
Any person who is willing to serve society and abide by the rules and regulations of the NGO to do service.

Donor
Any person who agrees to donate a certain amount of money to the NGO is eligible to become a donor.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(5) Volunteer: Any person who is willing to serve society and abide by the rules and
       regulations of the NGO to do service.
```

</details>

#### 🟢 art-7 clause (4) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 35

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 76.2%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. A person who has been recruited into the organization on follow of process as per Organization rules and regulations and is duly appointed by STM as such for any of the college units or works for the NGO in certain form shall be called as an STM ‘Member’..
2. A person who has registered online in the STM website and admitted in the NGO through a confirmation email and according to its regulations continues to be a member of the NGO.
3. An applicant can only be a member if appointed through the recruitment process by the competent authority as may be defined by society from time to time via the Board.
4. Any person who donates at least INR 30 (Rupees Thirty Only) shall be called ''STM DONOR''.
5. Eligibility of membership
    * (a)The following shall be eligible for membership in the society:-
      1. The applicant will strive to work for the achievement of the objectives of the society.
      2. The applicant shall abide by the Rules and Regulations of the Society.
      3. They shall maintain good moral conduct and behavior.
6. Termination of membership
    * (a)The membership of a member shall be terminated if he/she:
        1. Resigns from the membership of the society.
        2. Is found to be of unsound mind by a competent court.
        3. Is convicted of any offence involving moral turpitude.
        4. On the death of any member.
        5. If they are expelled from the society \
            (a) for misconduct \
            (b) for insubordination \
            (c) due to non-performance 
        6. If a member is found inactive or nonperforming, the member would be termed as inactive member in writing. The member will be under a performance plan with a notice of 2 months from the date of declaration to improve their performance to a satisfactory level. Failure to do so will result in termination.
    * (b)The Board member has authority to terminate or revoke the status of any member. The Intermediate board can terminate or revoke the membership of any member of units and the Unit Head can terminate or revoke the membership of a member within a unit with written approval from the Internal Compliance coordinator in writing for any reason stated in the suspension or termination article.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(4) Any person who donates at least INR 30 (Rupees Thirty Only) shall be called
       ''STM DONOR''.
```

</details>

#### 🟢 art-7 clause (6) — ALREADY-APPLIED

`substitute` · clause scope · source `act-1-2024` line 35

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 76.2%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. A person who has been recruited into the organization on follow of process as per Organization rules and regulations and is duly appointed by STM as such for any of the college units or works for the NGO in certain form shall be called as an STM ‘Member’..
2. A person who has registered online in the STM website and admitted in the NGO through a confirmation email and according to its regulations continues to be a member of the NGO.
3. An applicant can only be a member if appointed through the recruitment process by the competent authority as may be defined by society from time to time via the Board.
4. Any person who donates at least INR 30 (Rupees Thirty Only) shall be called ''STM DONOR''.
5. Eligibility of membership
    * (a)The following shall be eligible for membership in the society:-
      1. The applicant will strive to work for the achievement of the objectives of the society.
      2. The applicant shall abide by the Rules and Regulations of the Society.
      3. They shall maintain good moral conduct and behavior.
6. Termination of membership
    * (a)The membership of a member shall be terminated if he/she:
        1. Resigns from the membership of the society.
        2. Is found to be of unsound mind by a competent court.
        3. Is convicted of any offence involving moral turpitude.
        4. On the death of any member.
        5. If they are expelled from the society \
            (a) for misconduct \
            (b) for insubordination \
            (c) due to non-performance 
        6. If a member is found inactive or nonperforming, the member would be termed as inactive member in writing. The member will be under a performance plan with a notice of 2 months from the date of declaration to improve their performance to a satisfactory level. Failure to do so will result in termination.
    * (b)The Board member has authority to terminate or revoke the status of any member. The Intermediate board can terminate or revoke the membership of any member of units and the Unit Head can terminate or revoke the membership of a member within a unit with written approval from the Internal Compliance coordinator in writing for any reason stated in the suspension or termination article.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(6) (a) 6. If a member is found inactive or nonperforming, the member would be
      termed as inactive member in writing. The member will be under a performance plan
      with a notice of 2 months from the date of declaration to improve their performance to
      a satisfactory level. Failure to do so will result in termination.
          (b)The Board member has authority to terminate or revoke the status of any
      member. The Intermediate board can terminate or revoke the membership of any
      member of units and the Unit Head can terminate or revoke the membership of a
      member within a unit with written approval from the Internal Compliance coordinator
      in writing for any reason stated in the suspension or termination article.
```

</details>

#### 🟢 art-9 — ALREADY-APPLIED

`substitute` · article scope · source `act-1-2024` line 55

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 28.3%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. The board members are responsible for proper functioning of the NGO by guiding IBM. <br>
2. The board members are responsible for all activities of the NGO, but they are not held responsible for any activity undertaken by any member without informing the authorized person. <br>
3. Any new establishments and any modifications shall be done with the final document approval of the board. <br>
4. Board holds the ultimate powers over the STM and its final decisions <br>
5. The board consists of the following members: <br>
    1. President
    2. Vice President
    3. General Secretary
    4. Treasurer
    5. Joint Secretary
    6. Executive Members
6. All the board members should abide by the rules and regulations of the NGO and work according to the constitution of the NGO and by-laws of the NGO. <br>
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) The board members are responsible for proper functioning of the NGO by guiding
      IBM.
      (2) The board members are responsible for all activities of the NGO, but they are not
      held responsible for any activity undertaken by any member without informing the
      authorized person.
      (3) Any new establishments and any modifications shall be done with the final
      document approval of the board.
      (4) Board holds the ultimate powers over the STM and its final decisions
      (5) The board consists of the following members:
                  1. President
                  2. Vice President
                  3. General Secretary
                  4. Treasurer
                  5. Joint Secretary
                  6. Executive Members
      (6) All the board members should abide by the rules and regulations of the NGO and
      work according to the constitution of the NGO and by-laws of the NGO.
```

</details>

#### 🟢 art-10 — ALREADY-APPLIED

`substitute` · article scope · source `act-1-2024` line 76

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 32.7%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
Eligibility
Any person who has been selfless service to the NGO and abides by the rules and regulations of the NGO is eligible to become an IBM.

Selection Process
The selection process for the IBM is as follows:
1. The person should fill out the application form for IBM.
2. The person will engage in recruitment rounds conducted by the board.
3. The person should be selected by the board.

Roles and Responsibilities
The Intermediate Board Members are responsible for proper functioning of STM units. IBM should abide by the rules and regulations of the NGO and work according to the constitution. \
The IBM are as follows:
  1. Human Resources Coordinator:
  The Human Resources coordinator is  responsible for all activities of the recruitment process and internship programs of the NGO.    
  2. Finance Coordinator:
  The Finance coordinator is responsible for all financial
  activities of the NGO and needs to submit the details time to time to the
  Treasurer. The annual report of the NGO should be submitted to the board.
  3. Designing Coordinator:
  The Designing coordinator is responsible for all graphics designing activities of the NGO. They are responsible for maintaining high quality designs.
  4. Public Relations Coordinator:
  The Public Relations coordinator is
  responsible for all public relations activities of the NGO.
  5. Technical Coordinator:
  The Technical coordinator is responsible for all
  technical activities of the NGO and maintains the high quality of the
  technical work. The coordinator needs to promote the open source
  technologies of the NGO.
  6. Internal Compliance Coordinator:
  The Internal Compliance coordinator is
  responsible to ensure that members are acting in accordance with the
  constitution and guidelines of the NGO. They can take any action on any
  member if they are not following the constitution and guidelines of the
  NGO.
  7. Operations Coordinator:
  The Operations Coordinator is responsible for day
  to day operations of the NGO.
  8. Documentation Coordinator:
  The Documentation Coordinator is responsible
  for all documents of the NGO and to maintain all documents secured.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) Eligibility
           Any person who has been selfless service to the NGO and abides by the rules and
           regulations of the NGO is eligible to become an IBM.
      (2) Selection Process
      The selection process for the IBM is as follows:

           1. The person should fill out the application form for IBM.
           2. The person will engage in recruitment rounds conducted by the board.
           3. The person should be selected by the board.
      (3) Roles and Responsibilities
                 The Intermediate Board Members are responsible for proper functioning of
      STM units. IBM should abide by the rules and regulations of the NGO and work
      according to the constitution.
      The IBM are as follows:
           1. Human Resources Coordinator : The Human Resources coordinator is
              responsible for all activities of the recruitment process and internship
              programs of the NGO.
           2. Finance Coordinator: The Finance coordinator is responsible for all financial
              activities of the NGO and needs to submit the details time to time to the
              Treasurer. The annual report of the NGO should be submitted to the board.
           3. Designing Coordinator: The Designing coordinator is responsible for all
              graphics designing activities of the NGO. They are responsible for
              maintaining high quality designs.
           4. Public Relations Coordinator: The Public Relations coordinator is
              responsible for all public relations activities of the NGO.
           5. Technical Coordinator: The Technical coordinator is responsible for all
              technical activities of the NGO and maintains the high quality of the
              technical work.. The coordinator needs to promote the open source
              technologies of the NGO.
           6. Internal Compliance Coordinator: The Internal Compliance coordinator is
              responsible to ensure that members are acting in accordance with the
              constitution and guidelines of the NGO. They can take any action on any
              member if they are not following the constitution and guidelines of the
              NGO.
           7. Operations Coordinator: The Operations Coordinator is responsible for day
              to day operations of the NGO.
           8. Documentation Coordinator: The Documentation Coordinator is responsible
              for all documents of the NGO and to maintain all documents secured.
```

</details>

#### 🟢 art-11 — ALREADY-APPLIED

`substitute` · article scope · source `act-1-2024` line 121

Reads as the Act **99.4%** · Act's words present 100.0% · unchanged since v1 26.8%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
units
- (a) The units of the NGO which are established in the colleges. Every unit consists a board with following members: 
  1. Head 
  2. Vice Head 
  3. Operations Department Head 
  4. Donations Department Head 
  5. Technical Department Head 
  6. Content and Report writing Department Head 
  7. Research and Development Department Head 
  8. Graphics Department Head 
- (b) All the members of the Unit should abide by the rules and regulations of the NGO and work according to the constitution. \
- (c) Coordinators are recruited every year through a selection process wherein the candidates are filtered through rounds and are recruited based on the criteria of the STM. \
- (d) Unselected candidates can still contribute as volunteers for the STM. \

Establishment
To establish a unit in a college, the following conditions should be satisfied:
- (a) There should be at least 10 people in the college who are willing to work for the NGO.
- (b) The head of the unit must consult the IBM-Human Resources Coordinator
- (c) The head of the unit must fill the application form for the college unit.
- (d) The head of the unit must attend the interview conducted by the IBM-Human Resources Coordinator
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) (a) The units of the NGO which are established in the colleges. Every unit
           consists a board with following members:
                              1. Head

                               2. Vice Head
                               3. Operations Department Head
                               4. Donations Department Head
                               5. Technical Department Head
                               6. Content and Report writing Department Head
                               7. Research and Development Department Head
                               8. Graphics Department Head
       (b) All the members of the Unit should abide by the rules and regulations of the NGO
       and work according to the constitution.
       (c) Coordinators are recruited every year through a selection process wherein the
       candidates are filtered through rounds and are recruited based on the criteria of the
       STM.
       (d) Unselected candidates can still contribute as volunteers for the STM.
       (2) Establishment
       To establish a unit in a college, the following conditions should be satisfied:
          (a) There should be at least 10 people in the college who are willing to work for
              the NGO.
          (b) The head of the unit must consult the IBM-Human Resources Coordinator
          (c) The head of the unit must fill the application form for the college unit.
          (d) The head of the unit must attend the interview conducted by the IBM-Human
       Resources Coordinator
```

</details>

#### 🟢 art-12 — ALREADY-APPLIED

`substitute` · article scope · source `act-1-2024` line 153

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 47.1%

> Title: current `Alumini` → enacted `Alumni`

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
“Alumni” refers to the member who has previously worked with the NGO.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) “Alumni” refers to the member who has previously worked with the NGO.
```

</details>

#### 🟢 art-18 — ALREADY-APPLIED

`insert` · article scope · source `act-1-2024` line 158

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 0.0%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. The Internal Compliance coordinator holds the right to suspend or terminate any member if they violate the constitution or guidelines in any way.
2. Any member defaming the NGO in any form will be terminated.
3. Any member of the NGO using the funds for personal/mismanagement, fake bills
and any finance related issues will be terminated and face legal prosecutions.
4. Any member of the NGO doing fraudulent works, misbehaving with a member
and making false allegations against any member will be terminated.
5. Any member who does not respond to calls/messages/emails for 2 days will be
warned. If the same instance repeats and fails to inform the reason, he will be
suspended/terminated.
6. Suspension or termination only happens after receiving a confirmation letter from
the Internal Compliance Coordinator.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) The Internal Compliance coordinator holds the right to suspend or terminate any
       member if they violate the constitution or guidelines in any way.
       (2) Any member defaming the NGO in any form will be terminated.
       (3) Any member of the NGO using the funds for personal/mismanagement, fake bills
       and any finance related issues will be terminated and face legal prosecutions.
       (4) Any member of the NGO doing fraudulent works, misbehaving with a member
       and making false allegations against any member will be terminated.

   (5) Any member who does not respond to calls/messages/emails for 2 days will be
   warned. If the same instance repeats and fails to inform the reason, he will be
   suspended/terminated.
   (6) Suspension or termination only happens after receiving a confirmation letter from
   the Internal Compliance Coordinator.
```

</details>

### Act 2 of 2024

#### 🟢 preamble — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 17

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 30.0%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
SERVICE TO MANKIND is a non-governmental organization registered under the
       Telangana Society Registration Act, 2001, representing a student-run organization for
       individuals motivated to fulfill their obligation towards societal betterment and
       cultivate socially responsible individuals.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
SERVICE TO MANKIND is a non-governmental organization registered under the
       Telangana Society Registration Act, 2001, representing a student-run organization for
       individuals motivated to fulfill their obligation towards societal betterment and
       cultivate socially responsible individuals.
```

</details>

#### 🟢 art-3 — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 24

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 35.0%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
To create a platform for students who have a motive to fulfill their obligation towards
       societal betterment by helping the underprivileged in every possible way.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
To create a platform for students who have a motive to fulfill their obligation towards
       societal betterment by helping the underprivileged in every possible way.
```

</details>

#### 🟢 art-4 — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 30

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 11.1%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
To nurture socially responsible personalities who enlighten the lives of the
       underprivileged.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
To nurture socially responsible personalities who enlighten the lives of the
       underprivileged.
```

</details>

#### 🟢 art-5 — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 36

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 55.6%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
To create a society where everyone has access to basic amenities and is treated
       equally.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
To create a society where everyone has access to basic amenities and is treated
       equally.
```

</details>

#### 🟢 art-8 — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 47

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 84.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
Internship is a program where the students of the college are given an opportunity to
       work for the NGO and to learn the working of the NGO as a coordinator in the
       respective unit.

Stipend
There is no stipend for the internship program. But the coordinators will be provided
with the certificate of internship in their respective units.

Duration
The duration of the internship program is two years.

Eligibility
Any student who is willing to serve the society and abide by the rules and regulations of
the NGO is eligible to become an coordinator, according to the article 7.

Selection Process
The selection process for the internship program is as follows:
         1. The student should fill out the application form for the internship program.
         2. The student will engage in recruitment rounds conducted by the unit board.
         3. The student should be selected by the unit board.

Roles and Responsibilities
All the coordinators should abide by the rules and regulations of the NGO. The
coordinator should work for the NGO in their respective departments for the betterment
of the society.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
Internship is a program where the students of the college are given an opportunity to
       work for the NGO and to learn the working of the NGO as a coordinator in the
       respective unit.
     1. Stipend
    There is no stipend for the internship program. But the coordinators will be provided
    with the certificate of internship in their respective units.
     2. Duration
    The duration of the internship program is two years.
     3. Eligibility
    Any student who is willing to serve the society and abide by the rules and regulations of
    the NGO is eligible to become an coordinator, according to the article 7.

    4. Selection Process
    The selection process for the internship program is as follows:
             1. The student should fill out the application form for the internship program.
             2. The student will engage in recruitment rounds conducted by the unit board.
             3. The student should be selected by the unit board.
     5. Roles and Responsibilities
    All the coordinators should abide by the rules and regulations of the NGO. The
    coordinator should work for the NGO in their respective departments for the betterment
    of the society.
```

</details>

#### 🟢 art-16 clause (3) — ALREADY-APPLIED

`substitute` · clause scope · source `act-2-2024` line 72

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 77.0%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. Any changes to the constitution of the NGO should be done by the board of the NGO.
2. The ammenments should be done according to the by-laws of the NGO.
3. All proposed amendments must be approved by a 2/3rd present and voting of the board of the NGO, the intermediate board of the NGO and units of the NGO collectively.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(3)All proposed amendments must be approved by a 2/3rd present and voting of the board of
the NGO, the intermediate board of the NGO and units of the NGO collectively.
```

</details>

#### 🟢 art-17 clause (1) — ALREADY-APPLIED

`substitute` · clause scope · source `act-2-2024` line 83

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 70.5%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
(a). In an event that the NGO fails to function totally and needs to be dissolved, the whole board of the NGO shall be dissolved. Else, the whole NGO shall be dissolved. The funds of the NGO will be transferred to the same objectives of the NGO.
(b). College Units of the NGO can only be dissolved by the Board of the NGO
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1)In an event that the NGO fails to function totally and needs to be dissolved, the whole
board of the NGO shall be dissolved. Else, the whole NGO shall be dissolved. The funds of
the NGO will be transferred to the same objectives of the NGO.
```

</details>

#### 🟢 art-14 — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 90

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 12.7%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
Sabbatical Leave
1. Board and IBM members can apply for leave for 3 months to 1 year . The
    request letter must be sent to the board 48 hours prior to the leave day.
2. If the leaves are proven to be false or invalid, a warning letter will be issued.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
1. Sabbatical Leave
         1. Board and IBM members can apply for leave for 3 months to 1 year . The
             request letter must be sent to the board 48 hours prior to the leave day.
         2. If the leaves are proven to be false or invalid, a warning letter will be issued.
```

</details>

#### 🟢 art-20 — ALREADY-APPLIED

`insert` · article scope · source `act-2-2024` line 97

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 0.0%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1.   The board and IBM should hold a meeting with the unit periodically.
   2.   The unit board should meet every month.
   3.   The unit board should meet the coordinators periodically.
   4.   If any member did not attend the meeting, appropriate action shall be taken.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
1.   The board and IBM should hold a meeting with the unit periodically.
   2.   The unit board should meet every month.
   3.   The unit board should meet the coordinators periodically.
   4.   If any member did not attend the meeting, appropriate action shall be taken.
```

</details>

#### 🟢 art-15 — ALREADY-APPLIED

`substitute` · article scope · source `act-2-2024` line 105

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 9.8%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
Voluntary
(a) Any Member can opt out of working for an Organization by submitting the
resignation letter to the Unit Head.

Involuntary
(a) Member can be terminated based on article 7 and 18
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
(1) Voluntary
                (a) Any Member can opt out of working for an Organization by submitting the
                resignation letter to the Unit Head.
            (2) Involuntary
                (a) Member can be terminated based on article 7 and 18
```

</details>

### Act 3 of 2024 — *Finance Act, 2024*

#### 🟢 art-13 — ALREADY-APPLIED

`substitute` · article scope · source `act-3-2024` line 18

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 70.4%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. All units must maintain task reports of all the events taken up during the financial
        year and must submit the reports to the IBM-Finance Coordinator at least 2 weeks
        prior to the Annual General Meeting.
        2. An annual report of all the activities conducted throughout the NGO shall be
        consolidated and maintained by the IBM-Finance Coordinator.
        3. The Annual Report of the NGO must be compulsorily prepared by the
        IBM-Finance Coordinator in the prescribed format mentioned in the Documentation
        guidelines.
        4. All the annual reports from the inception of the NGO must be maintained in the
        STM operations portal and on the NGO official website.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
1. All units must maintain task reports of all the events taken up during the financial
        year and must submit the reports to the IBM-Finance Coordinator at least 2 weeks
        prior to the Annual General Meeting.
        2. An annual report of all the activities conducted throughout the NGO shall be
        consolidated and maintained by the IBM-Finance Coordinator.
        3. The Annual Report of the NGO must be compulsorily prepared by the
        IBM-Finance Coordinator in the prescribed format mentioned in the Documentation
        guidelines.
        4. All the annual reports from the inception of the NGO must be maintained in the
        STM operations portal and on the NGO official website.
```

</details>

#### 🟢 art-21 — ALREADY-APPLIED

`insert` · article scope · source `act-3-2024` line 32

Reads as the Act **100.0%** · Act's words present 100.0% · unchanged since v1 0.0%

<details><summary>Current text — <code>constitution/current.yaml</code></summary>

```
1. The bank account of the NGO shall be maintained by the members of the board.
     2. The NGO has the right to take money from the general public in the form of
        donations.
     3. The NGO is permitted to conduct events/ parties in order to generate funds.
     4. The Treasurer and IBM-Finance coordinator has only the right to approve the funds
        for the activities.

 5. Every month IBM-Finance coordinator has to verify the activity reports and balance
    sheet and inform the Treasurer.
 6. Every Quarter of the year, the internal compliance coordinator will conduct an
    audit. Unit Finance coordinator is responsible for sending all reports and balance
    sheets to the Internal compliance coordinator for every three months.
```

</details>

<details><summary>Enacted text — as the Act prescribes it</summary>

```
1. The bank account of the NGO shall be maintained by the members of the board.
     2. The NGO has the right to take money from the general public in the form of
        donations.
     3. The NGO is permitted to conduct events/ parties in order to generate funds.
     4. The Treasurer and IBM-Finance coordinator has only the right to approve the funds
        for the activities.

 5. Every month IBM-Finance coordinator has to verify the activity reports and balance
    sheet and inform the Treasurer.
 6. Every Quarter of the year, the internal compliance coordinator will conduct an
    audit. Unit Finance coordinator is responsible for sending all reports and balance
    sheets to the Internal compliance coordinator for every three months.
```

</details>

## Sign-off

Applying an amendment already in force would duplicate or revert a provision, so every
🟡 NOT-APPLIED row must be confirmed before Phase 3 applies anything.

- [ ] 🟢 `art-6(1)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-6(2)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-6(3)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-6(4)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-6(5)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-7(4)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-7(6)` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-9` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-10` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-11` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-12` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-18` — Act 1 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `preamble` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-3` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-4` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-5` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-8` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-16(3)` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-17(1)` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-14` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-20` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-15` — Act 2 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-13` — Act 3 of 2024 — ALREADY-APPLIED
- [ ] 🟢 `art-21` — Act 3 of 2024 — ALREADY-APPLIED
