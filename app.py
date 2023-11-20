from flask import Flask, render_template, request, jsonify
import openai

openai.api_key = "cleapi"

import os

import re
import csv

import pandas as pd

import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
nltk.download('stopwords')
nltk.download('punkt')

stop_words = set(stopwords.words('french'))

chemin_fichier = "data/dataleroymerlin.csv" 

df = pd.read_csv(chemin_fichier).dropna(axis=1, how='all')

print(f"Le DataFrame a {df.shape[0]} lignes et {df.shape[1]} colonnes.")

print(df.head())

app = Flask(__name__, template_folder=os.path.abspath('templates'))

all_product_names = df['Product Name'].unique().tolist()

def main():
    nltk.download('stopwords')
    nltk.download('punkt')

def get_matching_product(product_type, criteria):
    with open("products.csv", "r", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        matches = [row for row in reader if product_type in row['Product Name']]

        if criteria["budget"]:
            matches = [product for product in matches if float(product['Product Price']) <= criteria["budget"]]
        

        return matches[0] if matches else None

def get_all_products():
    with open("products.csv", "r", encoding="utf-8") as file:
        reader = csv.DictReader(file)
        return [row for row in reader]

all_products = get_all_products()

def get_product_score(product, user_message):
    score = 0
    user_message_words = set(user_message.lower().split())

    for key, value in product.items():
        product_value_words = set(str(value).lower().split())
        score += len(user_message_words & product_value_words)  

    return score

def get_best_matching_product(user_message):
    max_score = -1
    best_match = None

    for product in all_products:
        product_score = get_product_score(product, user_message)
        if product_score > max_score:
            max_score = product_score
            best_match = product

    return best_match if max_score > 0 else None


user_message = "Je cherche une meuleuse Bosch pour travaux domestiques à moins de 50€."
recommended_product = get_best_matching_product(user_message)
if recommended_product:
    print(f"Selon vos besoins, je vous recommande le {recommended_product['Product Name']} de la marque {recommended_product['Brand']} qui coûte {recommended_product['Product Price']}€.")
else:
    print("Aucun produit ne correspond à vos critères.")


def get_recommendation(criteria):
    products = df.to_dict(orient="records")
    for criterion in criteria:
        products = [prod for prod in products if criterion.lower() in str(prod['Product Name']).lower() or criterion.lower() in str(prod['Product Features']).lower()]
    
    if len(products) == 0:
        return None, "Je suis désolé, mais je n'ai pas trouvé de produit correspondant à vos critères."
    else:
        recommended_product = products[0]
        explanation = "il correspond le mieux à vos critères parmi les options disponibles."
        return recommended_product, explanation

def select_most_popular(products):
    return products[0]

def extract_sorting_criteria(query):
    criteria_map = {
        "pas cher": ("Product Price", True),
        "puissant": ("Power", False), 
        "léger": ("Weight", True)
    }
    for keyword, (column, ascending) in criteria_map.items():
        if keyword in query:
            return column, ascending
    return None, None

def get_matching_products_based_on_keywords(keywords, column_to_sort=None, ascending=True, top_n=5):
    matching_products = df
    for keyword in keywords:
        matching_products = matching_products[
            matching_products['Product Name'].astype(str).str.contains(keyword, case=False, na=False) | 
            matching_products['Product Features'].astype(str).str.contains(keyword, case=False, na=False)
    ]

    
    if column_to_sort:
        matching_products = matching_products.sort_values(by=column_to_sort, ascending=ascending)

    return matching_products.head(top_n) if not matching_products.empty else None

def extract_keywords(text):
  
    word_tokens = word_tokenize(text)

   
    filtered_tokens = [w for w in word_tokens if w.lower() not in stop_words]

    common_phrases = ["pas cher", "haute qualité", "longue durée"]
    for phrase in common_phrases:
        if phrase in text:
            filtered_tokens.append(phrase)

    return filtered_tokens



def chat_with_ai(messages):
    try:
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=messages
        )
        ai_message = response.choices[0].message['content'].strip()

        user_messages_combined = " ".join([msg['content'] for msg in messages if msg['role'] == 'user'])
        
    
        mentioned_products = extract_mentioned_products(user_messages_combined)
        
        
        if mentioned_products:
            
            if len(messages) == 2:
                ai_message = f"Bien sûr! Quel type de {mentioned_products[0]} recherchez-vous? Pouvez-vous me donner plus de détails sur l'utilisation que vous comptez en faire?"
            else:
              
                criteria = extract_criteria(user_messages_combined)
                product = get_matching_product(mentioned_products[0], criteria)
                
                if product is not None:
                    ai_message = f"Selon vos besoins, je vous recommande le {product['Product Name']} qui coûte {product['Product Price']}€. C'est un excellent choix pour votre usage!"
                else:
                    ai_message = "Je suis désolé, mais je n'ai pas trouvé de produit correspondant à vos critères."
            
        return ai_message, None

    except Exception as e:
        print("Erreur lors de la communication avec l'IA:", e)
        return f"Désolé, une erreur s'est produite: {str(e)}. Veuillez réessayer plus tard.", None






def extract_mentioned_products(message):
    products = df['Product Name'].unique().tolist()
    mentioned = [product for product in products if product in message]
    return mentioned

def extract_mentioned_products(user_message):
    mentioned = [word for word in all_product_names if word in user_message]
    return mentioned

def extract_criteria(user_message):
   
    budget_match = re.search(r"(\d+)\s*€", user_message)
    budget = int(budget_match.group(1)) if budget_match else None

   
    
    return {
        "budget": budget,
        "usage": user_message
    }

def recommend_product(product_type, criteria):
    candidates = df[df['Product Name'].str.contains(product_type, case=False, na=False)]
    
    if "budget" in criteria:
        candidates = candidates[candidates["Product Price"] <= criteria["budget"]]
    
    
    if not candidates.empty:
        return candidates.sample().iloc[0]
    else:
        return None




def get_recommendation_from_full_context(user_messages):
 
    criteria = extract_keywords(user_messages)  
    return get_recommendation(criteria)

@app.route('/chat_with_ai', methods=['POST'])
def chat_with_ai_route():
    conversation_history = request.json['conversation_history']
    conversation_history = [{'role': 'user' if i % 2 == 0 else 'assistant', 'content': msg} for i, msg in enumerate(conversation_history)]
    
    ai_response, product_details = chat_with_ai(conversation_history)
    return_data = {"ai_response": ai_response}
    if product_details:
        return_data["product"] = product_details

    return jsonify(return_data)

@app.route('/feedback', methods=['POST'])
def collect_feedback():
    feedback_data = request.json['feedback']
  
    return jsonify({"status": "Feedback collected successfully."})



@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    main()
    app.run(debug=True, port=5001)
