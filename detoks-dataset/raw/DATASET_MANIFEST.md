# DeToks Dataset Manifest

## Overview
Complete instruction dataset for AI model training spanning 8 task categories with varying complexity levels.

**Total Entries: 2,231**

## Dataset Structure

### 1. Single-Task Dataset (1,000 entries)
- **Files**: `{category}_single.json` (8 files)
- **Count**: 125 entries per category × 8 categories
- **Complexity**: Basic single-instruction tasks
- **Format**: Korean input (10-60 chars) → English output (5-15 words)

Categories: `create`, `modify`, `analyze`, `explore`, `validate`, `execute`, `document`, `plan`

### 2. Two-Step Complex Dataset (400 entries)
- **Files**: `{category}_2step.json` (8 files)
- **Count**: 50 entries per category × 8 categories
- **Complexity**: Sequential tasks with 2 components
- **Format**: Korean input with 2 connected tasks → English command output
- **Pattern**: task1 → task2 (sequential execution)

### 3. Three-Step Complex Dataset (400 entries)
- **Files**: `{category}_3step.json` (8 files)
- **Count**: 50 entries per category × 8 categories
- **Complexity**: Sequential tasks with 3 components
- **Format**: Korean input with 3 connected tasks → English command output
- **Pattern**: task1 → task2 → task3 (sequential execution)

### 4. Real-World Complex Dataset (400 entries)
- **Files**: `{category}_realworld.json` (8 files)
- **Count**: 50 entries per category × 8 categories
- **Complexity**: Authentic workplace communication
- **Format**: Natural Korean narrative with technical context → Compressed English command
- **Characteristics**: Emotional language, multi-faceted requirements, practical scenarios

### 5. Manual Real-World Examples (21 entries)
- **File**: `manual_realworld.json`
- **Characteristics**: Hand-crafted authentic workplace scenarios
- **Features**: 
  - Natural conversational Korean with emotional expressions
  - Complex multi-requirement tasks
  - Real development challenges and contexts
  - Distribution: create (10), modify (5), analyze (2), validate (1), plan (1), explore (1), document (1)

### 6. Complex Example Dataset (10 entries)
- **File**: `complex_examples.json`
- **Characteristics**: Highly detailed real-world scenarios
- **Examples**: Test automation, FastAPI backends, React optimization, database analysis, repository structure, security audits, CI/CD pipelines, API documentation, microservices architecture, technical debt management

## Categories

All datasets include these 8 categories:
1. **create**: Building new features, systems, and components
2. **modify**: Refactoring, optimization, and improvement
3. **analyze**: Diagnosis, profiling, and investigation
4. **explore**: Discovery, mapping, and understanding
5. **validate**: Testing, verification, and quality assurance
6. **execute**: Deployment, automation, and execution
7. **document**: Writing guides, specs, and documentation
8. **plan**: Strategy, roadmap, and planning

## Data Format

### Common Fields
```json
{
  "id": "category_type_number",
  "category": "create|modify|analyze|explore|validate|execute|document|plan",
  "task_type": "single|complex_2step|complex_3step|complex_realworld",
  "input": "Korean language instruction (natural, conversational)",
  "output": "English command summary (5-15 words, imperative form)"
}
```

## Key Features

### Korean Input Characteristics
- **Variety**: 28+ different sentence endings
- **Authenticity**: Natural conversational tone
- **Complexity**: Single to multi-faceted requirements
- **Emotional**: Workplace emotion and context included

### English Output Characteristics
- **Conciseness**: 5-15 words (compressed format)
- **Clarity**: Imperative/command form
- **Semantic**: Direct translation maintaining meaning
- **Action-oriented**: Clear what needs to be done

## Usage Statistics

| Complexity Level | Count | % of Total |
|---|---|---|
| Single-task | 1,000 | 44.8% |
| 2-step complex | 400 | 17.9% |
| 3-step complex | 400 | 17.9% |
| Real-world (script) | 400 | 17.9% |
| Manual examples | 21 | 0.9% |
| Complex examples | 10 | 0.4% |
| **Total** | **2,231** | **100%** |

## Technical Notes

- All files encoded in UTF-8
- Korean and English text properly formatted
- Randomized generation with consistent quality
- Validated against dataset_policy.md specifications
- Organized by category for easy access and training

## Generation Methods

- **Single-task**: Template-based generation with diverse Korean endings
- **2-step & 3-step**: Sequential task combination with varied patterns
- **Real-world (script)**: Template-based authentic scenario generation
- **Manual examples**: Hand-crafted by domain experts
- **Complex examples**: Custom written complex scenarios

