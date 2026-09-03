import os
import uuid
from datetime import datetime, timedelta
from typing import Optional, List
from enum import Enum

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import create_engine, Column, String, Float, DateTime, ForeignKey, Boolean, Integer, Text, func, extract
from sqlalchemy.orm import sessionmaker, Session, relationship, declarative_base

os.makedirs("database", exist_ok=True)

# Config
DATABASE_URL = "sqlite:///./database/money_tracker.db"

# Database
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

SINGLE_USER_ID = "default_user"

class TransactionTypeEnum(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"

class AccountTypeEnum(str, Enum):
    WALLET = "wallet"
    INSTAPAY = "instapay"
    VISA = "visa"

class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, index=True)

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    type = Column(String(20), nullable=False)
    account = Column(String(20), nullable=False)
    amount = Column(Float, nullable=False)
    category = Column(String(100), nullable=False)
    date = Column(DateTime, nullable=False, index=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Category(Base):
    __tablename__ = "categories"
    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    type = Column(String(20), nullable=False)
    color = Column(String(7), nullable=False)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Budget(Base):
    __tablename__ = "budgets"
    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    category_id = Column(String(36), ForeignKey("categories.id"), nullable=False)
    amount = Column(Float, nullable=False)
    period = Column(String(20), default="monthly")
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)
    alert_threshold = Column(Integer, default=80)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic schemas
class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str

class TransactionCreate(BaseModel):
    type: str
    account: str
    amount: float = Field(gt=0)
    category: str
    date: datetime
    note: Optional[str] = None

class TransactionRead(TransactionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

class TransactionUpdate(BaseModel):
    type: Optional[str] = None
    account: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    category: Optional[str] = None
    date: Optional[datetime] = None
    note: Optional[str] = None

class CategoryCreate(BaseModel):
    name: str
    type: str
    color: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")

class CategoryRead(CategoryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    is_default: bool

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")

class BudgetCreate(BaseModel):
    category_id: str
    amount: float = Field(gt=0)
    period: str = "monthly"
    start_date: datetime
    end_date: Optional[datetime] = None
    alert_threshold: int = Field(default=80, ge=10, le=100)

class BudgetRead(BudgetCreate):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str

class BudgetUpdate(BaseModel):
    category_id: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)
    period: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    alert_threshold: Optional[int] = Field(default=None, ge=10, le=100)

class StatsResponse(BaseModel):
    totals: dict
    expense_by_category: dict

# App
app = FastAPI(title="Money Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Default categories
DEFAULT_CATEGORIES = [
    {"name": "مرتب", "type": "income", "color": "#27ae60", "is_default": True},
    {"name": "عمل حر", "type": "income", "color": "#2ecc71", "is_default": True},
    {"name": "استثمار", "type": "income", "color": "#1abc9c", "is_default": True},
    {"name": "أكل", "type": "expense", "color": "#e74c3c", "is_default": True},
    {"name": "مواصلات", "type": "expense", "color": "#f39c12", "is_default": True},
    {"name": "تسوق", "type": "expense", "color": "#9b59b6", "is_default": True},
    {"name": "فواتير", "type": "expense", "color": "#e67e22", "is_default": True},
    {"name": "صحة", "type": "expense", "color": "#c0392b", "is_default": True},
    {"name": "تعليم", "type": "expense", "color": "#3498db", "is_default": True},
    {"name": "ترفيه", "type": "expense", "color": "#1abc9c", "is_default": True},
    {"name": "أخرى", "type": "expense", "color": "#7f8c8d", "is_default": False},
]

def ensure_default_categories(db: Session):
    count = db.query(Category).count()
    if count == 0:
        for cat in DEFAULT_CATEGORIES:
            db.add(Category(
                id=str(uuid.uuid4()),
                user_id=SINGLE_USER_ID,
                **cat
            ))
        db.commit()

# Transaction endpoints
@app.post("/api/transactions", response_model=TransactionRead, status_code=201)
def create_transaction(txn: TransactionCreate, db: Session = Depends(get_db)):
    ensure_default_categories(db)
    transaction = Transaction(
        id=str(uuid.uuid4()),
        user_id=SINGLE_USER_ID,
        **txn.model_dump()
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction

@app.get("/api/transactions", response_model=List[TransactionRead])
def list_transactions(
    month: Optional[str] = None,
    account: Optional[str] = None,
    category: Optional[str] = None,
    type: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction).filter(Transaction.user_id == SINGLE_USER_ID)
    
    if month:
        year, month_num = map(int, month.split("-"))
        query = query.filter(
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month_num
        )
    if account:
        query = query.filter(Transaction.account == account)
    if category:
        query = query.filter(Transaction.category == category)
    if type:
        query = query.filter(Transaction.type == type)
    
    return query.order_by(Transaction.date.desc()).offset(skip).limit(limit).all()

@app.get("/api/transactions/stats", response_model=StatsResponse)
def get_stats(
    month: Optional[str] = None,
    account: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Transaction).filter(Transaction.user_id == SINGLE_USER_ID)
    
    if month:
        year, month_num = map(int, month.split("-"))
        query = query.filter(
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month_num
        )
    if account:
        query = query.filter(Transaction.account == account)
    if category:
        query = query.filter(Transaction.category == category)
    
    transactions = query.all()
    total_income = sum(t.amount for t in transactions if t.type == "income")
    total_expense = sum(t.amount for t in transactions if t.type == "expense")
    
    expense_by_cat = {}
    for t in transactions:
        if t.type == "expense":
            expense_by_cat[t.category] = expense_by_cat.get(t.category, 0) + t.amount
    
    return {
        "totals": {
            "total_income": total_income,
            "total_expense": total_expense,
            "balance": total_income - total_expense
        },
        "expense_by_category": expense_by_cat
    }

@app.get("/api/transactions/monthly-summary")
def monthly_summary(
    months: int = 6,
    db: Session = Depends(get_db)
):
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=months * 30)
    
    transactions = db.query(Transaction).filter(
        Transaction.user_id == SINGLE_USER_ID,
        Transaction.date >= start_date,
        Transaction.date <= end_date
    ).all()
    
    monthly = {}
    for t in transactions:
        month_key = t.date.strftime("%Y-%m")
        if month_key not in monthly:
            monthly[month_key] = {"income": 0, "expense": 0}
        if t.type == "income":
            monthly[month_key]["income"] += t.amount
        else:
            monthly[month_key]["expense"] += t.amount
    
    return [
        {"month": k, "income": v["income"], "expense": v["expense"]}
        for k, v in sorted(monthly.items())
    ]

@app.get("/api/transactions/filters")
def get_filters(db: Session = Depends(get_db)):
    months = db.query(
        func.strftime("%Y-%m", Transaction.date).label("month")
    ).filter(Transaction.user_id == SINGLE_USER_ID).distinct().order_by(func.strftime("%Y-%m", Transaction.date).desc()).all()
    
    accounts = db.query(Transaction.account).filter(Transaction.user_id == SINGLE_USER_ID).distinct().all()
    categories = db.query(Transaction.category).filter(Transaction.user_id == SINGLE_USER_ID).distinct().all()
    
    return {
        "months": [m.month for m in months],
        "accounts": [a.account for a in accounts],
        "categories": [c.category for c in categories]
    }

@app.get("/api/transactions/{txn_id}", response_model=TransactionRead)
def get_transaction(txn_id: str, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(
        Transaction.id == txn_id,
        Transaction.user_id == SINGLE_USER_ID
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return txn

@app.patch("/api/transactions/{txn_id}", response_model=TransactionRead)
def update_transaction(txn_id: str, txn_in: TransactionUpdate, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(
        Transaction.id == txn_id,
        Transaction.user_id == SINGLE_USER_ID
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    for field, value in txn_in.model_dump(exclude_unset=True).items():
        setattr(txn, field, value)
    txn.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(txn)
    return txn

@app.delete("/api/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: str, db: Session = Depends(get_db)):
    txn = db.query(Transaction).filter(
        Transaction.id == txn_id,
        Transaction.user_id == SINGLE_USER_ID
    ).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(txn)
    db.commit()

# Category endpoints
@app.post("/api/categories", response_model=CategoryRead, status_code=201)
def create_category(cat: CategoryCreate, db: Session = Depends(get_db)):
    ensure_default_categories(db)
    category = Category(
        id=str(uuid.uuid4()),
        user_id=SINGLE_USER_ID,
        **cat.model_dump()
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return category

@app.get("/api/categories", response_model=List[CategoryRead])
def list_categories(type: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Category).filter(Category.user_id == SINGLE_USER_ID)
    if type:
        query = query.filter(Category.type == type)
    return query.order_by(Category.type, Category.name).all()

@app.patch("/api/categories/{cat_id}", response_model=CategoryRead)
def update_category(cat_id: str, cat_in: CategoryUpdate, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.user_id == SINGLE_USER_ID
    ).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    
    for field, value in cat_in.model_dump(exclude_unset=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    return cat

@app.delete("/api/categories/{cat_id}", status_code=204)
def delete_category(cat_id: str, db: Session = Depends(get_db)):
    cat = db.query(Category).filter(
        Category.id == cat_id,
        Category.user_id == SINGLE_USER_ID
    ).first()
    if not cat or cat.is_default:
        raise HTTPException(status_code=404, detail="Category not found or cannot delete default")
    db.delete(cat)
    db.commit()

# Budget endpoints
@app.post("/api/budgets", response_model=BudgetRead, status_code=201)
def create_budget(budget: BudgetCreate, db: Session = Depends(get_db)):
    ensure_default_categories(db)
    budget_obj = Budget(
        id=str(uuid.uuid4()),
        user_id=SINGLE_USER_ID,
        **budget.model_dump()
    )
    db.add(budget_obj)
    db.commit()
    db.refresh(budget_obj)
    return budget_obj

@app.get("/api/budgets", response_model=List[BudgetRead])
def list_budgets(db: Session = Depends(get_db)):
    return db.query(Budget).filter(Budget.user_id == SINGLE_USER_ID).order_by(Budget.created_at.desc()).all()

@app.patch("/api/budgets/{budget_id}", response_model=BudgetRead)
def update_budget(budget_id: str, budget_in: BudgetUpdate, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == SINGLE_USER_ID
    ).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    for field, value in budget_in.model_dump(exclude_unset=True).items():
        setattr(budget, field, value)
    db.commit()
    db.refresh(budget)
    return budget

@app.delete("/api/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: str, db: Session = Depends(get_db)):
    budget = db.query(Budget).filter(
        Budget.id == budget_id,
        Budget.user_id == SINGLE_USER_ID
    ).first()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(budget)
    db.commit()

@app.get("/health")
def health():
    return {"status": "ok"}

# Serve frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/{full_path:path}")
async def serve_frontend(request: Request, full_path: str):
    file_path = os.path.join(FRONTEND_DIR, full_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)