import pandas as pd

df = pd.read_parquet("ml/data/processed/training_table.parquet")
df = df[df["year"] == 2024].reset_index(drop=True)
df.to_parquet("ml/data/processed/training_table_2024.parquet", index=False)
print(len(df), "rows saved")