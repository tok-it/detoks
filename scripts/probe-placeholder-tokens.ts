import { getLlama } from "node-llama-cpp";

const llama = await getLlama();
const model = await llama.loadModel({
	modelPath: process.env.LOCAL_LLM_MODEL_PATH!,
});

const candidates = [
	"__PH_0001__",
	"__PHC_0001__",
	"__PH_0001__ __PH_0002__",
	"‹PH0001›",
	"⟨PH0001⟩",
	"<<PH0001>>",
	"<PH0001>",
	"{{PH0001}}",
	"%PH0001%",
];

for (const c of candidates) {
	const tokens = model.tokenize(c);
	const decoded = tokens.map((t) => model.detokenize([t]));
	console.log(`[${tokens.length}] "${c}" → ${JSON.stringify(decoded)}`);
}

await model.dispose();
await llama.dispose();
