from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_serializer,
    field_validator,
    model_validator,
)

NonEmptyName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RegisterInput(InputModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=10, max_length=128)
    display_name: NonEmptyName


class LoginInput(InputModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=1, max_length=128)
    client_type: Literal["web", "mobile"]


class RefreshInput(InputModel):
    refresh_token: str | None = Field(default=None, min_length=50, max_length=200)


class TokenOutput(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_token: str | None = None


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    display_name: str
    created_at: datetime


class InstrumentOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    symbol: str
    name: str
    exchange: str
    asset_type: str
    currency: str
    is_active: bool


class AllocationInput(InputModel):
    instrument_id: UUID
    weight: Decimal = Field(gt=0, le=1, max_digits=12, decimal_places=10, allow_inf_nan=False)

    @field_validator("weight", mode="before", json_schema_input_type=str)
    @classmethod
    def decimal_string_only(cls, value):
        if not isinstance(value, (str, Decimal)):
            raise ValueError("weight must be a decimal string, e.g. '0.6' for 60%")
        return value


class ConfigurationInput(InputModel):
    allocations: list[AllocationInput] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def check_allocations(self):
        ids = [item.instrument_id for item in self.allocations]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate instrument_id")
        if sum((item.weight for item in self.allocations), Decimal("0")) > Decimal("1"):
            raise ValueError("Allocation weights must sum to at most 1 (100%)")
        return self


class PortfolioCreate(ConfigurationInput):
    name: NonEmptyName
    description: str | None = Field(default=None, max_length=2000)
    base_currency: Literal["USD"] = "USD"


class ConfigurationUpdate(ConfigurationInput):
    expected_version: int = Field(ge=1)


class MetadataUpdate(InputModel):
    name: NonEmptyName
    description: str | None = Field(default=None, max_length=2000)
    expected_version: int = Field(ge=1)


class AllocationOutput(BaseModel):
    instrument_id: UUID
    symbol: str
    weight: Decimal

    @field_serializer("weight")
    def serialize_weight(self, value):
        return format(value, "f")


class VersionOutput(BaseModel):
    id: UUID
    version_number: int
    created_at: datetime
    allocations: list[AllocationOutput]


class VersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    version_number: int
    created_at: datetime


class PortfolioSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    description: str | None
    base_currency: str
    current_version: int
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class PortfolioDetail(PortfolioSummary):
    latest_version: VersionOutput
